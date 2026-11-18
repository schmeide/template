import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const code = (value: TRPCError["code"]) => ({ code: value }) satisfies Partial<TRPCError>;

const approvedRequest = async () => {
  const submitter = await caller.people.add({ name: randomUUID() });
  const reviewer = await caller.people.add({ name: randomUUID() });
  const type = await caller.requests.createType({
    name: `Membership application ${randomUUID()}`,
    fields: [{ label: "Name", kind: "text", required: true }],
  });
  const request = await caller.requests.create({
    typeId: type.id,
    actorId: submitter.id,
    answers: { Name: "Pat Lee" },
  });
  await caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" });
  await caller.requests.transition({ id: request.id, actorId: reviewer.id, to: "approved" });
  return request;
};

describe("requestCustomers router", () => {
  it("adds an approved request as a customer, lists it on them, and refuses a second", async () => {
    const request = await approvedRequest();

    const customer = await caller.requestCustomers.convert({
      requestId: request.id,
      customer: { name: "  Pat Lee  " },
    });

    expect(customer.name).toBe("Pat Lee");
    expect(await caller.requestCustomers.forRequest({ id: request.id })).toEqual({
      id: customer.id,
      name: "Pat Lee",
    });
    expect(await caller.requestCustomers.forCustomer({ id: customer.id })).toMatchObject([
      { id: request.id },
    ]);
    await expect(
      caller.requestCustomers.convert({ requestId: request.id, customerId: customer.id })
    ).rejects.toMatchObject(code("CONFLICT"));
  });

  it("validates the new customer and answers a missing request with NOT_FOUND", async () => {
    await expect(
      caller.requestCustomers.convert({ requestId: 1, customer: { name: " " } })
    ).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(
      caller.requestCustomers.convert({ requestId: -1, customerId: 1 })
    ).rejects.toMatchObject(code("NOT_FOUND"));
  });
});
