import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const setUp = async () => {
  const [stage] = await caller.deals.board();
  const deal = await caller.deals.create({ title: randomUUID(), stageId: stage.id });
  const type = await caller.requests.createType({
    name: randomUUID(),
    fields: [{ label: "Guard rails", kind: "check", required: true }],
  });
  const actor = await caller.people.add({ name: randomUUID() });
  return { deal, type, actor };
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("deal requests router", () => {
  it("files a draft request for a deal and reports the link from both sides", async () => {
    const { deal, type, actor } = await setUp();

    const request = await caller.dealRequests.create({
      itemId: deal.id,
      typeId: type.id,
      actorId: actor.id,
    });

    expect(await caller.requests.get({ id: request.id })).toMatchObject({
      status: "draft",
      submitterId: actor.id,
    });
    expect(await caller.dealRequests.list({ id: deal.id })).toMatchObject([
      { id: request.id, typeName: type.name, status: "draft" },
    ]);
    expect(await caller.dealRequests.deal({ id: request.id })).toEqual({
      id: deal.id,
      title: deal.title,
    });
  });

  it("refuses a deal or a type that does not exist", async () => {
    const { deal, type, actor } = await setUp();

    await expect(
      caller.dealRequests.create({ itemId: -1, typeId: type.id, actorId: actor.id })
    ).rejects.toMatchObject(withCode("NOT_FOUND"));
    await expect(
      caller.dealRequests.create({ itemId: deal.id, typeId: -1, actorId: actor.id })
    ).rejects.toMatchObject(withCode("NOT_FOUND"));
  });

  it("returns null for a request with no deal", async () => {
    expect(await caller.dealRequests.deal({ id: -1 })).toBeNull();
  });
});
