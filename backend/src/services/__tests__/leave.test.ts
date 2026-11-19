import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Answers, Field, Status } from "../../db/schema/approval.ts";
import { ledgerEntries } from "../../db/schema/ledger.ts";
import { leavePostings } from "../../db/schema/leave.ts";
import { createRequest, createType, transition } from "../approval.ts";
import { createAccount, getAccount, reverseEntry } from "../ledger.ts";
import {
  getPosting,
  listForAccount,
  listLeaveAccounts,
  postLeave,
  setLeaveAccount,
} from "../leave.ts";
import { addPerson } from "../people.ts";

// Tests share one database, so they create their own people, balances and requests.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const fields: readonly Field[] = [
  {
    label: "Kind of leave",
    kind: "choice",
    required: false,
    options: ["Vacation", "Sick", "Unpaid"],
  },
  { label: "First day", kind: "date", required: false },
  { label: "Last day", kind: "date", required: false },
  { label: "Days", kind: "number", required: false },
];

const leave = (answers: Answers = {}): Answers => ({
  "Kind of leave": "Vacation",
  "First day": "2026-07-06",
  "Last day": "2026-07-10",
  Days: 5,
  ...answers,
});

const balance = (floor: number | null = null) =>
  createAccount(db, { name: `Vacation ${randomUUID()}`, unit: "days", floor });

// A leave request from a new person in `status`, reached through allowed steps.
const requestIn = async (status: Status = "approved", answers: Answers = leave()) => {
  const submitter = await addPerson(db, { name: randomUUID() });
  const reviewer = await addPerson(db, { name: randomUUID() });
  const type = await createType(db, { name: `Leave ${randomUUID()}`, fields: [...fields] });
  const request = await createRequest(db, { typeId: type.id, actorId: submitter.id, answers });
  if (!request) throw new Error("The type is missing");
  if (status !== "draft") {
    await transition(db, { id: request.id, actorId: submitter.id, to: "submitted" });
  }
  if (status === "approved" || status === "rejected") {
    await transition(db, { id: request.id, actorId: reviewer.id, to: status });
  }
  return { request, submitter };
};

// An approved request whose submitter's Vacation draws on a new balance.
const mapped = async (answers?: Answers, floor: number | null = null) => {
  const { request, submitter } = await requestIn("approved", leave(answers));
  const account = await balance(floor);
  await setLeaveAccount(db, { personId: submitter.id, kind: "Vacation", accountId: account.id });
  return { request, submitter, account };
};

const entriesOn = (accountId: number) =>
  db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, accountId));

describe("leave balance service", () => {
  it("sets, changes and clears the balance a person's kind of leave draws on", async () => {
    const person = await addPerson(db, { name: randomUUID() });
    const first = await balance();
    const second = await balance();

    await setLeaveAccount(db, { personId: person.id, kind: "Vacation", accountId: first.id });
    await setLeaveAccount(db, { personId: person.id, kind: "Vacation", accountId: second.id });
    expect(await listLeaveAccounts(db, person.id)).toEqual([
      { personId: person.id, kind: "Vacation", accountId: second.id },
    ]);

    expect(
      await setLeaveAccount(db, { personId: person.id, kind: "Vacation", accountId: null })
    ).toBeNull();
    expect(await listLeaveAccounts(db, person.id)).toEqual([]);
  });

  it("refuses a balance another person's leave already draws on", async () => {
    const ana = await addPerson(db, { name: randomUUID() });
    const sam = await addPerson(db, { name: randomUUID() });
    const account = await balance();
    await setLeaveAccount(db, { personId: ana.id, kind: "Vacation", accountId: account.id });

    expect(
      await setLeaveAccount(db, { personId: sam.id, kind: "Vacation", accountId: account.id })
    ).toEqual({ problem: `That balance is already ${ana.name}’s Vacation leave. Choose another.` });
  });

  it("makes one row when two people set the same person's kind at once", async () => {
    const person = await addPerson(db, { name: randomUUID() });
    const [first, second] = [await balance(), await balance()];

    await Promise.all([
      setLeaveAccount(db, { personId: person.id, kind: "Vacation", accountId: first.id }),
      setLeaveAccount(db, { personId: person.id, kind: "Vacation", accountId: second.id }),
    ]);

    expect(await listLeaveAccounts(db, person.id)).toHaveLength(1);
  });

  it("takes an approved request's days off the balance, dated its first day, linked both ways", async () => {
    const { request, submitter, account } = await mapped();

    const posted = await postLeave(db, request.id);

    expect(posted).toMatchObject({
      entry: {
        accountId: account.id,
        kind: "out",
        quantity: -5,
        entryDate: "2026-07-06",
        who: submitter.name,
        reference: `Request #${request.id}`,
      },
    });
    expect((await getAccount(db, account.id))?.balance).toBe(-5);
    expect(await getPosting(db, request.id)).toMatchObject({
      accountId: account.id,
      accountName: account.name,
      quantity: -5,
    });
    expect(await listForAccount(db, account.id)).toEqual({
      drawnBy: [{ personName: submitter.name, kind: "Vacation" }],
      postings: [
        expect.objectContaining({ requestId: request.id, quantity: -5, entryDate: "2026-07-06" }),
      ],
    });
  });

  it("posts once when two people take the same request off at once", async () => {
    const { request, account } = await mapped();

    const results = await Promise.all([postLeave(db, request.id), postLeave(db, request.id)]);

    expect(results.filter((result) => result && "entry" in result)).toHaveLength(1);
    expect(results).toContainEqual({ problem: "This request has already come off a balance." });
    expect(await entriesOn(account.id)).toHaveLength(1);
  });

  it("takes two requests off one balance at once, each counted", async () => {
    const { request, submitter, account } = await mapped({ Days: 2 });
    const second = await createRequest(db, {
      typeId: request.typeId,
      actorId: submitter.id,
      answers: leave({ Days: 3 }),
    });
    if (!second) throw new Error("The type is missing");
    const reviewer = await addPerson(db, { name: randomUUID() });
    await transition(db, { id: second.id, actorId: submitter.id, to: "submitted" });
    await transition(db, { id: second.id, actorId: reviewer.id, to: "approved" });

    await Promise.all([postLeave(db, request.id), postLeave(db, second.id)]);

    expect((await getAccount(db, account.id))?.balance).toBe(-5);
  });

  it("posts only an approved request", async () => {
    for (const status of ["draft", "submitted", "rejected"] as const) {
      const { request, submitter } = await requestIn(status);
      const account = await balance();
      await setLeaveAccount(db, {
        personId: submitter.id,
        kind: "Vacation",
        accountId: account.id,
      });

      expect(await postLeave(db, request.id)).toEqual({
        problem: "Only an approved request comes off a balance.",
      });
      expect(await entriesOn(account.id)).toEqual([]);
    }
  });

  it("refuses a request with no kind of leave, no first day, or no whole number of days above zero", async () => {
    for (const days of [undefined, 0, -1, 1.5]) {
      const { request, account } = await mapped({ Days: days as number });

      expect(await postLeave(db, request.id)).toEqual({
        problem: "Days must be a whole number above zero to come off a balance.",
      });
      expect(await entriesOn(account.id)).toEqual([]);
    }
    const incomplete: readonly Answers[] = [
      { Days: 1, "First day": "2026-07-06" },
      { Days: 1, "Kind of leave": "Vacation" },
    ];
    for (const answers of incomplete) {
      const { request } = await requestIn("approved", answers);
      expect(await postLeave(db, request.id)).toEqual({
        problem: "Only a request with a Kind of leave and a First day comes off a balance.",
      });
    }
  });

  it("refuses a kind with no balance, naming the person and the kind", async () => {
    const { request, submitter } = await mapped({ "Kind of leave": "Sick" });

    expect(await postLeave(db, request.id)).toEqual({
      problem: `${submitter.name}’s Sick leave draws on no balance. Choose one, then try again.`,
    });
    expect(
      await db.select().from(leavePostings).where(eq(leavePostings.requestId, request.id))
    ).toEqual([]);
  });

  it("goes through the stock floor, refusing nothing on a balance allowed below zero", async () => {
    const { request: floored, account: kept } = await mapped(undefined, 0);
    expect(await postLeave(db, floored.id)).toEqual({
      problem: "That would take the balance below its floor. Allow it below zero, then try again.",
    });
    expect(await entriesOn(kept.id)).toEqual([]);
    expect(await getPosting(db, floored.id)).toBeNull();

    const { request, account } = await mapped(undefined, null);
    expect(await postLeave(db, request.id)).toHaveProperty("entry");
    expect((await getAccount(db, account.id))?.balance).toBe(-5);
  });

  it("keeps the request posted after its entry is reversed", async () => {
    const { request, account } = await mapped();
    const posted = await postLeave(db, request.id);
    if (!posted || !("entry" in posted)) throw new Error("Not posted");

    await reverseEntry(db, { entryId: posted.entry.id, entryDate: "2026-07-07" });

    expect(await postLeave(db, request.id)).toEqual({
      problem: "This request has already come off a balance.",
    });
    expect((await getAccount(db, account.id))?.balance).toBe(0);
  });

  it("knows no request it was not given", async () => {
    expect(await postLeave(db, 2_000_000_000)).toBeUndefined();
    expect(await getPosting(db, 2_000_000_000)).toBeNull();
  });
});
