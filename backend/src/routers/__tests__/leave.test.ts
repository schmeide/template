import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const leaveRequest = async () => {
  const submitter = await caller.people.add({ name: randomUUID() });
  const reviewer = await caller.people.add({ name: randomUUID() });
  const type = await caller.requests.createType({
    name: `Leave ${randomUUID()}`,
    fields: [
      { label: "Kind of leave", kind: "choice", required: true, options: ["Vacation", "Sick"] },
      { label: "First day", kind: "date", required: true },
      { label: "Days", kind: "number", required: true },
    ],
  });
  const request = await caller.requests.create({
    typeId: type.id,
    actorId: submitter.id,
    answers: { "Kind of leave": "Sick", "First day": "2026-07-06", Days: 2 },
  });
  await caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" });
  await caller.requests.transition({ id: request.id, actorId: reviewer.id, to: "approved" });
  return { request, submitter };
};

describe("leave router", () => {
  it("sets a person's balance for a kind and takes a request off it", async () => {
    const { request, submitter } = await leaveRequest();
    const account = await caller.stock.createAccount({ name: randomUUID(), floor: null });

    await caller.leave.setAccount({
      personId: submitter.id,
      kind: " Sick ",
      accountId: account.id,
    });
    const { entry } = await caller.leave.post({ requestId: request.id });

    expect(await caller.leave.accounts({ personId: submitter.id })).toEqual([
      { personId: submitter.id, kind: "Sick", accountId: account.id },
    ]);
    expect(entry.quantity).toBe(-2);
    expect(await caller.leave.forRequest({ requestId: request.id })).toMatchObject({
      entryId: entry.id,
    });
  });

  it("answers a refusal as a conflict naming the person and the kind", async () => {
    const { request, submitter } = await leaveRequest();

    await expect(caller.leave.post({ requestId: request.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: `${submitter.name}’s Sick leave draws on no balance. Choose one, then try again.`,
    } satisfies Partial<TRPCError>);
    await expect(caller.leave.post({ requestId: 2_000_000_000 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });

  it("refuses a blank kind", async () => {
    await expect(
      caller.leave.setAccount({ personId: 1, kind: "  ", accountId: null })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });
});
