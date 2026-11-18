import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const march = { from: "2026-03-01", to: "2026-03-31" };

const newAccount = async () => {
  const account = await caller.stock.createAccount({ name: randomUUID(), unit: "min" });
  const customer = await caller.customers.create({ name: randomUUID() });
  await caller.stock.addEntry({
    accountId: account.id,
    kind: "in",
    quantity: 90,
    entryDate: "2026-03-10",
  });
  return { accountId: account.id, customerId: customer.id };
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("billing router", () => {
  it("sets the billing, previews and bills the period", async () => {
    const { accountId, customerId } = await newAccount();
    expect(await caller.billing.get({ id: accountId })).toBeNull();

    await caller.billing.set({ accountId, customerId, rate: 6000 });

    expect(await caller.billing.get({ id: accountId })).toEqual({
      accountId,
      customerId,
      rate: 6000,
    });
    expect((await caller.billing.preview({ accountId, ...march })).total).toBe(9000);
    const invoice = await caller.billing.bill({ accountId, ...march });
    expect(await caller.invoices.get({ id: invoice.id })).toMatchObject({
      status: "draft",
      total: 9000,
    });
    await expect(caller.billing.bill({ accountId, ...march })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
  });

  it("asks for the customer and rate before billing", async () => {
    const { accountId } = await newAccount();

    await expect(caller.billing.preview({ accountId, ...march })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("customer and hourly rate"),
    });
    await expect(caller.billing.bill({ accountId, ...march })).rejects.toMatchObject(
      withCode("PRECONDITION_FAILED")
    );
  });

  it("refuses a negative rate and a period that ends before it starts", async () => {
    const { accountId, customerId } = await newAccount();

    await expect(caller.billing.set({ accountId, customerId, rate: -1 })).rejects.toMatchObject(
      withCode("BAD_REQUEST")
    );
    await expect(
      caller.billing.preview({ accountId, from: "2026-03-31", to: "2026-03-01" })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });
});
