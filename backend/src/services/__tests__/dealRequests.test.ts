import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Field } from "../../db/schema/approval.ts";
import { dealRequests } from "../../db/schema/dealRequests.ts";
import {
  createType,
  getRequest,
  InvalidAnswers,
  listRequests,
  setPublic,
  submitPublicly,
  transition,
  updateRequest,
} from "../approval.ts";
import { addStage, createItem, getItem } from "../pipeline.ts";
import { addPerson } from "../people.ts";
import { createDealRequest, getRequestDeal, listDealRequests } from "../dealRequests.ts";

// Tests share one database, so they create their own rows and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const fields: readonly Field[] = [
  { label: "Scaffold tied in", kind: "check", required: true },
  { label: "Notes", kind: "text", required: false },
];

const person = () => addPerson(db, { name: randomUUID() });
const newType = () =>
  createType(db, { name: `Site inspection ${randomUUID()}`, fields: [...fields] });

const newDeal = async () => {
  const stage = await addStage(db, { name: randomUUID() });
  const deal = await createItem(db, { title: randomUUID(), stageId: stage.id });
  if (!deal) throw new Error("The stage is missing");
  return deal;
};

const linksFor = (requestId: number) =>
  db.select().from(dealRequests).where(eq(dealRequests.requestId, requestId));

describe("deal requests service", () => {
  it("makes a draft request of the type, by the person acting, and lists it on the deal", async () => {
    const deal = await newDeal();
    const type = await newType();
    const actor = await person();

    const request = await createDealRequest(db, {
      itemId: deal.id,
      typeId: type.id,
      actorId: actor.id,
    });

    expect(request).toMatchObject({ typeId: type.id, submitterId: actor.id, status: "draft" });
    expect(await listDealRequests(db, deal.id)).toEqual([
      {
        id: request?.id,
        typeName: type.name,
        status: "draft",
        submittedAt: null,
      },
    ]);
    expect(await getRequestDeal(db, request?.id ?? -1)).toEqual({ id: deal.id, title: deal.title });
  });

  it("gives a deal any number of requests, newest first", async () => {
    const deal = await newDeal();
    const type = await newType();
    const actorId = (await person()).id;

    const first = await createDealRequest(db, { itemId: deal.id, typeId: type.id, actorId });
    const second = await createDealRequest(db, { itemId: deal.id, typeId: type.id, actorId });

    expect((await listDealRequests(db, deal.id)).map((row) => row.id)).toEqual([
      second?.id,
      first?.id,
    ]);
  });

  it("links each request to at most one deal", async () => {
    const deal = await newDeal();
    const other = await newDeal();
    const type = await newType();
    const request = await createDealRequest(db, {
      itemId: deal.id,
      typeId: type.id,
      actorId: (await person()).id,
    });

    await expect(
      db.insert(dealRequests).values({ itemId: other.id, requestId: request?.id ?? -1 })
    ).rejects.toThrow();
    expect(await linksFor(request?.id ?? -1)).toHaveLength(1);
    expect(await listDealRequests(db, other.id)).toEqual([]);
  });

  it("makes nothing for a deal or a type that does not exist", async () => {
    const deal = await newDeal();
    const type = await newType();
    const actorId = (await person()).id;

    expect(await createDealRequest(db, { itemId: -1, typeId: type.id, actorId })).toBeUndefined();
    expect(await createDealRequest(db, { itemId: deal.id, typeId: -1, actorId })).toBeUndefined();
    expect(await listRequests(db, { typeId: type.id })).toEqual([]);
    expect(await listDealRequests(db, deal.id)).toEqual([]);
  });

  it("makes neither the request nor the link when the person does not exist", async () => {
    const deal = await newDeal();
    const type = await newType();

    await expect(
      createDealRequest(db, { itemId: deal.id, typeId: type.id, actorId: -1 })
    ).rejects.toThrow();
    expect(await listRequests(db, { typeId: type.id })).toEqual([]);
    expect(await listDealRequests(db, deal.id)).toEqual([]);
  });

  it("leaves the requests shape's rules in force: required fields and who decides", async () => {
    const deal = await newDeal();
    const type = await newType();
    const submitter = await person();
    const reviewer = await person();
    const request = await createDealRequest(db, {
      itemId: deal.id,
      typeId: type.id,
      actorId: submitter.id,
    });
    const id = request?.id ?? -1;

    await expect(
      transition(db, { id, actorId: submitter.id, to: "submitted" })
    ).rejects.toBeInstanceOf(InvalidAnswers);
    await updateRequest(db, {
      id,
      actorId: submitter.id,
      answers: { "Scaffold tied in": { result: "fail" } },
    });
    await transition(db, { id, actorId: submitter.id, to: "submitted" });
    expect(await transition(db, { id, actorId: submitter.id, to: "approved" })).toBeUndefined();
    expect(await transition(db, { id, actorId: reviewer.id, to: "rejected" })).toMatchObject({
      status: "rejected",
    });
    expect((await listDealRequests(db, deal.id))[0]).toMatchObject({
      status: "rejected",
      submittedAt: expect.any(Date),
    });
  });

  it("never moves the deal, and a failed inspection leaves it where it is", async () => {
    const deal = await newDeal();
    const type = await newType();
    const submitter = await person();
    const request = await createDealRequest(db, {
      itemId: deal.id,
      typeId: type.id,
      actorId: submitter.id,
    });
    const id = request?.id ?? -1;
    await updateRequest(db, {
      id,
      actorId: submitter.id,
      answers: { "Scaffold tied in": { result: "fail", note: "Loose at level 2" } },
    });
    await transition(db, { id, actorId: submitter.id, to: "submitted" });
    await transition(db, { id, actorId: (await person()).id, to: "rejected" });

    const after = await getItem(db, deal.id);
    expect(after?.stageId).toBe(deal.stageId);
    expect(after?.activity).toEqual([]);
    expect((await getRequest(db, id))?.status).toBe("rejected");
  });

  it("does not link a request filed through public intake", async () => {
    const type = await newType();
    const token = (await setPublic(db, type.id, true))?.publicToken ?? "";
    await submitPublicly(db, {
      token,
      contact: "Pat",
      answers: { "Scaffold tied in": { result: "pass" } },
    });
    const [request] = await listRequests(db, { typeId: type.id });

    expect(await getRequestDeal(db, request.id)).toBeNull();
  });

  it("makes one request and one link each when two people start checklists at once", async () => {
    const deal = await newDeal();
    const type = await newType();
    const [kim, sam] = await Promise.all([person(), person()]);

    const made = await Promise.all([
      createDealRequest(db, { itemId: deal.id, typeId: type.id, actorId: kim.id }),
      createDealRequest(db, { itemId: deal.id, typeId: type.id, actorId: sam.id }),
    ]);

    const listed = await listDealRequests(db, deal.id);
    expect(listed).toHaveLength(2);
    expect(new Set(listed.map((row) => row.id))).toEqual(
      new Set(made.map((request) => request?.id))
    );
    expect(new Set(made.map((request) => request?.submitterId))).toEqual(new Set([kim.id, sam.id]));
    for (const request of made) expect(await linksFor(request?.id ?? -1)).toHaveLength(1);
    expect((await getItem(db, deal.id))?.stageId).toBe(deal.stageId);
  });
});
