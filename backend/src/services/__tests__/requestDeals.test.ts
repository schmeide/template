import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Field, Status } from "../../db/schema/approval.ts";
import { customers } from "../../db/schema/customers.ts";
import { pipelineStages } from "../../db/schema/pipeline.ts";
import { requestDeals } from "../../db/schema/requestDeals.ts";
import {
  createType,
  getRequest,
  listRequests,
  setPublic,
  submitPublicly,
  transition,
  createRequest,
} from "../approval.ts";
import { createCustomer } from "../customers.ts";
import { addNote, getItem } from "../pipeline.ts";
import { addPerson } from "../people.ts";
import { convertRequest, getForDeal, getForRequest } from "../requestDeals.ts";

// Tests share one database, so they create their own rows and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const fields: readonly Field[] = [
  { label: "Problem", kind: "text", required: true },
  { label: "Urgency", kind: "choice", required: false, options: ["Today", "This week"] },
  { label: "Gas safe", kind: "check", required: false },
  { label: "Preferred day", kind: "date", required: false },
];

const person = () => addPerson(db, { name: randomUUID() });

// A staff request in `status`, reached through allowed steps.
const requestIn = async (status: Status = "approved") => {
  const submitter = await person();
  const reviewer = await person();
  const type = await createType(db, { name: `Callout ${randomUUID()}`, fields: [...fields] });
  const request = await createRequest(db, {
    typeId: type.id,
    actorId: submitter.id,
    answers: { Problem: "Boiler leaks", "Gas safe": { result: "fail", note: "No certificate" } },
  });
  if (!request) throw new Error("The type is missing");
  const step = (to: Exclude<Status, "draft">, actorId: number) =>
    transition(db, { id: request.id, actorId, to });
  if (status === "withdrawn") await step("withdrawn", submitter.id);
  if (["submitted", "approved", "rejected", "returned"].includes(status)) {
    await step("submitted", submitter.id);
  }
  if (status === "approved" || status === "rejected" || status === "returned") {
    await step(status, reviewer.id);
  }
  return { request, type };
};

const newCustomer = () => createCustomer(db, { name: randomUUID() });

const linksFor = (requestId: number) =>
  db.select().from(requestDeals).where(eq(requestDeals.requestId, requestId));

describe("request to deal service", () => {
  it("makes an approved request into a deal in the first stage, titled from its type", async () => {
    const { request, type } = await requestIn();
    const customer = await newCustomer();

    const made = await convertRequest(db, { requestId: request.id, customerId: customer.id });

    const deal = await getItem(db, made?.id ?? -1);
    const [first] = await db
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.position))
      .limit(1);
    expect(deal).toMatchObject({ title: type.name, customerId: customer.id, stageId: first.id });
  });

  it("copies the answers into the deal's first note", async () => {
    const { request } = await requestIn();

    const made = await convertRequest(db, {
      requestId: request.id,
      customerId: (await newCustomer()).id,
    });

    const deal = await getItem(db, made?.id ?? -1);
    expect(deal?.activity.map((entry) => [entry.kind, entry.text])).toEqual([
      ["note", "Problem: Boiler leaks\nGas safe: Fail (No certificate)"],
    ]);
  });

  it("puts a public request's contact first in the note", async () => {
    const type = await createType(db, { name: randomUUID(), fields: [...fields] });
    const token = (await setPublic(db, type.id, true))?.publicToken ?? "";
    await submitPublicly(db, {
      token,
      contact: "Pat, 07700 900123",
      answers: { Problem: "No heat", Urgency: "Today", "Preferred day": "2026-12-01" },
    });
    const [request] = await listRequests(db, { typeId: type.id });
    await transition(db, { id: request.id, actorId: (await person()).id, to: "approved" });

    const made = await convertRequest(db, {
      requestId: request.id,
      customerId: (await newCustomer()).id,
    });

    const deal = await getItem(db, made?.id ?? -1);
    expect(deal?.activity[0].text).toBe(
      "Contact: Pat, 07700 900123\nProblem: No heat\nUrgency: Today\nPreferred day: 2026-12-01"
    );
  });

  it("creates the customer a person typed in, and nothing is matched on the contact", async () => {
    const { request } = await requestIn();
    const name = randomUUID();

    const made = await convertRequest(db, { requestId: request.id, customer: { name } });

    const created = await db.select().from(customers).where(eq(customers.name, name));
    expect(created).toHaveLength(1);
    expect(made?.customerId).toBe(created[0].id);
  });

  it("refuses a customer that does not exist, and makes nothing", async () => {
    const { request } = await requestIn();

    expect(await convertRequest(db, { requestId: request.id, customerId: -1 })).toBeUndefined();
    expect(await linksFor(request.id)).toEqual([]);
  });

  it("links the request and the deal both ways", async () => {
    const { request, type } = await requestIn();
    expect(await getForRequest(db, request.id)).toBeNull();

    const made = await convertRequest(db, {
      requestId: request.id,
      customerId: (await newCustomer()).id,
    });

    const link = {
      request: { id: request.id, typeName: type.name },
      deal: { id: made?.id, title: type.name },
    };
    expect(await getForRequest(db, request.id)).toEqual(link);
    expect(await getForDeal(db, made?.id ?? -1)).toEqual(link);
  });

  it.each(["draft", "submitted", "returned", "rejected", "withdrawn"] as const)(
    "refuses a %s request, since only an approved request converts",
    async (status) => {
      const { request } = await requestIn(status);
      const name = randomUUID();

      expect(
        await convertRequest(db, { requestId: request.id, customer: { name } })
      ).toBeUndefined();
      expect(await linksFor(request.id)).toEqual([]);
      expect(await db.select().from(customers).where(eq(customers.name, name))).toEqual([]);
    }
  );

  it("converts a request once and leaves it approved", async () => {
    const { request } = await requestIn();
    const customerId = (await newCustomer()).id;

    expect(await convertRequest(db, { requestId: request.id, customerId })).toBeDefined();
    expect(await convertRequest(db, { requestId: request.id, customerId })).toBeUndefined();
    expect(await linksFor(request.id)).toHaveLength(1);
    expect((await getRequest(db, request.id))?.status).toBe("approved");
  });

  it("makes one deal and one customer when two people convert the same request at once", async () => {
    const { request } = await requestIn();
    const name = randomUUID();

    const results = await Promise.all([
      convertRequest(db, { requestId: request.id, customer: { name } }),
      convertRequest(db, { requestId: request.id, customer: { name } }),
    ]);

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    expect(await linksFor(request.id)).toHaveLength(1);
    expect(await db.select().from(customers).where(eq(customers.name, name))).toHaveLength(1);
  });

  it("leaves the request alone when the deal changes", async () => {
    const { request } = await requestIn();
    const made = await convertRequest(db, {
      requestId: request.id,
      customerId: (await newCustomer()).id,
    });

    await addNote(db, { itemId: made?.id ?? -1, text: "Booked for Tuesday" });

    expect((await getRequest(db, request.id))?.status).toBe("approved");
    expect((await getForRequest(db, request.id))?.deal.id).toBe(made?.id);
  });
});
