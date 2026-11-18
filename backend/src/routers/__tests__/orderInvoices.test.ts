import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

// An order moved on to `ready`.
const readyOrder = async () => {
  const product = await caller.orders.createProduct({ name: randomUUID(), price: 500 });
  const { token } = await caller.orders.checkout({
    name: "Ada Lovelace",
    email: `${randomUUID()}@example.com`,
    address: "12 Analytical Row",
    lines: [{ productId: product.id, quantity: 2 }],
  });
  const [order] = (await caller.orders.list({ status: "new" })).filter(
    (row) => row.token === token
  );
  await caller.orders.setStatus({ id: order.id, to: "accepted" });
  await caller.orders.setStatus({ id: order.id, to: "ready" });
  return order.id;
};

describe("order invoices router", () => {
  it("invoices a fulfilled order once, and links both ways", async () => {
    const id = await readyOrder();
    await expect(caller.orderInvoices.invoice({ orderId: id })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
    await caller.orders.setStatus({ id, to: "fulfilled" });

    const invoice = await caller.orderInvoices.invoice({ orderId: id });

    expect(await caller.invoices.get({ id: invoice.id })).toMatchObject({
      status: "draft",
      total: 1000,
    });
    expect((await caller.orderInvoices.get({ id })).invoice?.id).toBe(invoice.id);
    expect(await caller.orderInvoices.order({ id: invoice.id })).toMatchObject({ id });
    await expect(caller.orderInvoices.invoice({ orderId: id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Void that invoice"),
    });
  });

  it("answers NOT_FOUND for a missing order", async () => {
    await expect(caller.orderInvoices.get({ id: 2_000_000_000 })).rejects.toMatchObject(
      withCode("NOT_FOUND")
    );
    await expect(caller.orderInvoices.invoice({ orderId: 2_000_000_000 })).rejects.toMatchObject(
      withCode("NOT_FOUND")
    );
  });
});
