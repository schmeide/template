import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const submitted = async () => {
  const submitter = await caller.people.add({ name: randomUUID() });
  const reviewer = await caller.people.add({ name: randomUUID() });
  const type = await caller.requests.createType({
    name: randomUUID(),
    fields: [{ label: "Problem", kind: "text", required: true }],
  });
  const request = await caller.requests.create({
    typeId: type.id,
    actorId: submitter.id,
    answers: { Problem: "Leak" },
  });
  await caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" });
  const approve = () =>
    caller.requests.transition({ id: request.id, actorId: reviewer.id, to: "approved" });
  return { request, type, approve };
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("request deals router", () => {
  it("converts an approved request and reports the link from both sides", async () => {
    const { request, type, approve } = await submitted();
    await approve();

    const deal = await caller.requestDeals.convert({
      requestId: request.id,
      customer: { name: `  ${randomUUID()}  ` },
    });

    expect(await caller.deals.get({ id: deal.id })).toMatchObject({ title: type.name });
    expect((await caller.requestDeals.forRequest({ id: request.id }))?.deal.id).toBe(deal.id);
    expect((await caller.requestDeals.forDeal({ id: deal.id }))?.request.id).toBe(request.id);
  });

  it("refuses a request that is not approved, or converted already, as a conflict", async () => {
    const { request, approve } = await submitted();
    const customer = await caller.customers.create({ name: randomUUID() });
    const convert = () =>
      caller.requestDeals.convert({ requestId: request.id, customerId: customer.id });

    await expect(convert()).rejects.toMatchObject(withCode("CONFLICT"));
    await approve();
    await convert();
    await expect(convert()).rejects.toMatchObject(withCode("CONFLICT"));
  });

  it("refuses a new customer with no name", async () => {
    const { request } = await submitted();

    await expect(
      caller.requestDeals.convert({ requestId: request.id, customer: { name: "   " } })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });

  it("returns null for a request or a deal with no link", async () => {
    const { request } = await submitted();
    expect(await caller.requestDeals.forRequest({ id: request.id })).toBeNull();
    expect(await caller.requestDeals.forDeal({ id: -1 })).toBeNull();
  });
});
