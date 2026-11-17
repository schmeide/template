import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { fieldsSchema, type Field, type Status } from "../../db/schema/approval.ts";
import {
  addPerson,
  createRequest,
  createType,
  defaultTypes,
  getPublicForm,
  getRequest,
  InvalidAnswers,
  listRequests,
  listTypes,
  setPublic,
  submitPublicly,
  takePublicSlot,
  transition,
  updateRequest,
  updateType,
} from "../approval.ts";

// Tests share one database, so they create their own people and types and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const fields: readonly Field[] = [
  { label: "Reason", kind: "text", required: true },
  { label: "Days", kind: "number", required: false },
  { label: "From", kind: "date", required: false },
  { label: "Kind", kind: "choice", required: false, options: ["Vacation", "Sick"] },
  { label: "Brakes", kind: "check", required: false },
];

const person = () => addPerson(db, { name: randomUUID() });

const newType = async (approverId?: number) =>
  createType(db, { name: randomUUID(), fields: [...fields], approverId });

const draft = async (submitterId: number, approverId?: number) => {
  const type = await newType(approverId);
  const request = await createRequest(db, {
    typeId: type.id,
    actorId: submitterId,
    answers: { Reason: "Holiday" },
  });
  if (!request) throw new Error("The type is missing");
  return request;
};

// A request in `status`, reached through allowed steps, with its submitter and a reviewer.
const requestIn = async (status: Status) => {
  const submitter = await person();
  const reviewer = await person();
  const request = await draft(submitter.id);
  const step = (to: Exclude<Status, "draft">, actorId: number) =>
    transition(db, { id: request.id, actorId, to });
  if (status === "withdrawn") await step("withdrawn", submitter.id);
  if (["submitted", "approved", "rejected", "returned"].includes(status)) {
    await step("submitted", submitter.id);
  }
  if (status === "approved" || status === "rejected" || status === "returned") {
    await step(status, reviewer.id);
  }
  const reached = await getRequest(db, request.id);
  expect(reached?.status).toBe(status);
  return { request, submitter, reviewer };
};

describe("approval service", () => {
  it("ships a valid default Leave type and lists types", async () => {
    expect(defaultTypes.map((type) => type.name)).toContain("Leave");
    for (const type of defaultTypes) {
      expect(fieldsSchema.safeParse(type.fields).success).toBe(true);
    }
    expect((await listTypes(db)).length).toBeGreaterThan(0);
  });

  it("creates a draft that copies the type's fields and keeps valid answers", async () => {
    const submitter = await person();
    const type = await newType();

    const request = await createRequest(db, {
      typeId: type.id,
      actorId: submitter.id,
      answers: {
        Reason: "  Holiday  ",
        Days: 3,
        From: "2026-12-01",
        Kind: "Vacation",
        Brakes: { result: "fail", note: "Worn" },
        Unknown: "dropped",
      },
    });

    expect(request).toMatchObject({
      status: "draft",
      submitterId: submitter.id,
      fields,
      answers: {
        Reason: "Holiday",
        Days: 3,
        From: "2026-12-01",
        Kind: "Vacation",
        Brakes: { result: "fail", note: "Worn" },
      },
    });
  });

  it.each([
    ["a number as text", { Days: "three" }],
    ["a malformed date", { From: "soon" }],
    ["an option that is not offered", { Kind: "Party" }],
    ["a check with no result", { Brakes: { note: "x" } }],
  ])("refuses %s", async (_label, answers) => {
    const submitter = await person();
    const type = await newType();

    await expect(
      createRequest(db, { typeId: type.id, actorId: submitter.id, answers })
    ).rejects.toThrow(InvalidAnswers);
  });

  it("keeps a submitted request readable after its type's fields change", async () => {
    const { request } = await requestIn("submitted");
    const type = (await listTypes(db)).find((candidate) => candidate.id === request.typeId);
    if (!type) throw new Error("The type is missing");

    await updateType(db, {
      id: type.id,
      name: type.name,
      fields: [{ label: "Something else", kind: "text", required: true }],
    });

    const after = await getRequest(db, request.id);
    expect(after?.fields).toEqual(fields);
    expect(after?.answers).toEqual({ Reason: "Holiday" });
  });

  it("re-copies the type's current fields when a draft is saved again", async () => {
    const submitter = await person();
    const request = await draft(submitter.id);
    const changed: readonly Field[] = [{ label: "Why", kind: "text", required: true }];
    await updateType(db, { id: request.typeId, name: randomUUID(), fields: [...changed] });

    const saved = await updateRequest(db, {
      id: request.id,
      actorId: submitter.id,
      answers: { Why: "Rest" },
    });

    expect(saved).toMatchObject({ fields: changed, answers: { Why: "Rest" } });
  });

  it("lets only the submitter edit, and only a draft or returned request", async () => {
    const { request, submitter, reviewer } = await requestIn("returned");

    expect(
      await updateRequest(db, { id: request.id, actorId: reviewer.id, answers: { Reason: "x" } })
    ).toBeUndefined();
    expect(
      await updateRequest(db, { id: request.id, actorId: submitter.id, answers: { Reason: "y" } })
    ).toMatchObject({ answers: { Reason: "y" } });

    await transition(db, { id: request.id, actorId: submitter.id, to: "submitted" });
    expect(
      await updateRequest(db, { id: request.id, actorId: submitter.id, answers: { Reason: "z" } })
    ).toBeUndefined();
  });

  it.each([
    ["draft", "submitted", "submitter"],
    ["draft", "withdrawn", "submitter"],
    ["returned", "submitted", "submitter"],
    ["returned", "withdrawn", "submitter"],
    ["submitted", "withdrawn", "submitter"],
    ["submitted", "approved", "reviewer"],
    ["submitted", "rejected", "reviewer"],
    ["submitted", "returned", "reviewer"],
  ] as const)("moves %s to %s by the %s and records it", async (from, to, who) => {
    const { request, submitter, reviewer } = await requestIn(from);
    const actorId = who === "submitter" ? submitter.id : reviewer.id;

    const moved = await transition(db, { id: request.id, actorId, to, comment: "  Noted  " });

    expect(moved?.status).toBe(to);
    const detail = await getRequest(db, request.id);
    expect(detail?.decisions[0]).toMatchObject({ outcome: to, actorId, comment: "Noted" });
  });

  it.each([
    ["draft", "approved", "reviewer"],
    ["draft", "rejected", "reviewer"],
    ["draft", "returned", "reviewer"],
    ["submitted", "submitted", "submitter"],
    ["returned", "approved", "reviewer"],
    ["approved", "rejected", "reviewer"],
    ["approved", "withdrawn", "submitter"],
    ["rejected", "approved", "reviewer"],
    ["rejected", "submitted", "submitter"],
    ["withdrawn", "submitted", "submitter"],
    ["withdrawn", "approved", "reviewer"],
    ["draft", "submitted", "reviewer"],
    ["submitted", "withdrawn", "reviewer"],
  ] as const)("refuses %s to %s by the %s", async (from, to, who) => {
    const { request, submitter, reviewer } = await requestIn(from);
    const actorId = who === "submitter" ? submitter.id : reviewer.id;

    expect(await transition(db, { id: request.id, actorId, to })).toBeUndefined();
    expect((await getRequest(db, request.id))?.status).toBe(from);
  });

  it.each(["approved", "rejected", "returned"] as const)(
    "does not let the submitter decide (%s) their own request",
    async (to) => {
      const { request, submitter } = await requestIn("submitted");

      expect(await transition(db, { id: request.id, actorId: submitter.id, to })).toBeUndefined();
      expect((await getRequest(db, request.id))?.status).toBe("submitted");
    }
  );

  it("lets only the type's approver decide when it names one", async () => {
    const submitter = await person();
    const approver = await person();
    const other = await person();
    const request = await draft(submitter.id, approver.id);
    await transition(db, { id: request.id, actorId: submitter.id, to: "submitted" });

    expect(
      await transition(db, { id: request.id, actorId: other.id, to: "approved" })
    ).toBeUndefined();
    expect(
      await transition(db, { id: request.id, actorId: approver.id, to: "approved" })
    ).toMatchObject({ status: "approved" });
  });

  it("will not submit a request with a required answer missing", async () => {
    const submitter = await person();
    const type = await newType();
    const request = await createRequest(db, {
      typeId: type.id,
      actorId: submitter.id,
      answers: {},
    });
    if (!request) throw new Error("The type is missing");

    await expect(
      transition(db, { id: request.id, actorId: submitter.id, to: "submitted" })
    ).rejects.toThrow(InvalidAnswers);
    expect((await getRequest(db, request.id))?.status).toBe("draft");
  });

  it("makes one decision when several reviewers decide at once", async () => {
    const { request, reviewer } = await requestIn("submitted");
    const outcomes = ["approved", "rejected", "returned"] as const;
    // Open the connections first, so the attempts overlap instead of waiting for a connection.
    await Promise.all(Array.from({ length: 9 }, () => db.execute(sql`select 1`)));

    const results = await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        transition(db, { id: request.id, actorId: reviewer.id, to: outcomes[index % 3] })
      )
    );

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    const detail = await getRequest(db, request.id);
    expect(detail?.decisions.map((decision) => decision.outcome)).toEqual([
      detail?.status,
      "submitted",
    ]);
  });

  it("returns nothing for a request or type that does not exist", async () => {
    const someone = await person();

    expect(await getRequest(db, -1)).toBeUndefined();
    expect(await transition(db, { id: -1, actorId: someone.id, to: "submitted" })).toBeUndefined();
    expect(
      await createRequest(db, { typeId: -1, actorId: someone.id, answers: {} })
    ).toBeUndefined();
  });

  it("lists a submitter's requests and the review queue", async () => {
    const { request, submitter } = await requestIn("submitted");
    const mine = await draft(submitter.id);

    const own = await listRequests(db, { submitterId: submitter.id });
    const queue = await listRequests(db, { status: "submitted" });

    expect(own.map((row) => row.id).sort()).toEqual([request.id, mine.id].sort());
    expect(own[0]).toHaveProperty("typeName");
    expect(queue.map((row) => row.id)).toContain(request.id);
    expect(queue.map((row) => row.id)).not.toContain(mine.id);
  });

  describe("public intake", () => {
    it("opens and closes a type's public link", async () => {
      const type = await newType();

      const opened = await setPublic(db, type.id, true);
      const token = opened?.publicToken ?? "";
      expect(await getPublicForm(db, token)).toEqual({ name: type.name, fields });
      expect(Object.keys((await getPublicForm(db, token)) ?? {})).toEqual(["name", "fields"]);

      await setPublic(db, type.id, false);
      expect(await getPublicForm(db, token)).toBeUndefined();
    });

    it("files a public submission as submitted, from the contact given", async () => {
      const type = await newType();
      const opened = await setPublic(db, type.id, true);

      const result = await submitPublicly(db, {
        token: opened?.publicToken ?? "",
        contact: "Pat, pat@example.com",
        answers: { Reason: "Leak" },
      });

      expect(result).toEqual({ received: true });
      const [filed] = await listRequests(db, { typeId: type.id });
      expect(filed).toMatchObject({ status: "submitted", contact: "Pat, pat@example.com" });
      expect((await getRequest(db, filed.id))?.decisions).toMatchObject([
        { outcome: "submitted", actorId: null },
      ]);
    });

    it("pretends to accept a submission with the honeypot filled, and keeps nothing", async () => {
      const type = await newType();
      const opened = await setPublic(db, type.id, true);

      const result = await submitPublicly(db, {
        token: opened?.publicToken ?? "",
        contact: "Bot",
        answers: { Reason: "Spam" },
        website: "http://spam.example",
      });

      expect(result).toEqual({ received: true });
      expect(await listRequests(db, { typeId: type.id })).toEqual([]);
    });

    it("refuses a closed link and a submission missing a required answer", async () => {
      const type = await newType();
      const token = randomUUID();

      expect(
        await submitPublicly(db, { token, contact: "Pat", answers: { Reason: "x" } })
      ).toBeUndefined();
      const opened = await setPublic(db, type.id, true);
      await expect(
        submitPublicly(db, { token: opened?.publicToken ?? "", contact: "Pat", answers: {} })
      ).rejects.toThrow(InvalidAnswers);
    });

    it("limits submissions per address in a time window", () => {
      const address = randomUUID();
      const start = 1_000_000;

      const taken = Array.from({ length: 6 }, () => takePublicSlot(address, start));

      expect(taken).toEqual([true, true, true, true, true, false]);
      expect(takePublicSlot(randomUUID(), start)).toBe(true);
      expect(takePublicSlot(address, start + 60 * 60 * 1000)).toBe(true);
    });
  });
});
