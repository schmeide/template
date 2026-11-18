import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

const draft = async () => {
  const submitter = await caller.people.add({ name: randomUUID() });
  const type = await caller.requests.createType({
    name: randomUUID(),
    fields: [{ label: "Problem", kind: "text", required: false }],
  });
  return caller.requests.create({ typeId: type.id, actorId: submitter.id, answers: {} });
};

describe("request units router", () => {
  it("sets, reads and clears a request's unit", async () => {
    const unit = await caller.assets.create({ name: randomUUID() });
    const request = await draft();

    await caller.requestUnits.set({ requestId: request.id, recordId: unit.id });

    expect(await caller.requestUnits.forRequest({ id: request.id })).toMatchObject({
      id: unit.id,
    });
    expect(await caller.requestUnits.forUnit({ id: unit.id })).toEqual([
      expect.objectContaining({ id: request.id, status: "draft" }),
    ]);
    await caller.requestUnits.set({ requestId: request.id, recordId: null });
    expect(await caller.requestUnits.forRequest({ id: request.id })).toBeNull();
  });

  it("refuses an archived unit and a missing request", async () => {
    const unit = await caller.assets.create({ name: randomUUID() });
    await caller.assets.archive({ id: unit.id });
    const request = await draft();

    await expect(
      caller.requestUnits.set({ requestId: request.id, recordId: unit.id })
    ).rejects.toMatchObject(withCode("PRECONDITION_FAILED"));
    await expect(
      caller.requestUnits.set({ requestId: 2_000_000_000, recordId: unit.id })
    ).rejects.toMatchObject(withCode("NOT_FOUND"));
  });
});
