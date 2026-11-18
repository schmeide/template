import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

// A product mapped to a new item holding `balance`, and a ready order for `count` of it.
const readyOrder = async (balance: number, count: number) => {
  const product = await caller.orders.createProduct({ name: randomUUID(), price: 500 });
  const item = await caller.stock.createAccount({ name: randomUUID(), unit: "pcs", floor: 0 });
  await caller.stock.addEntry({
    accountId: item.id,
    kind: "in",
    quantity: balance,
    entryDate: "2026-04-01",
  });
  await caller.orderStock.setItem({ productId: product.id, accountId: item.id, quantity: 1 });
  const { token } = await caller.orders.checkout({
    name: "Ada Lovelace",
    email: "ada@example.com",
    address: "12 Analytical Row",
    lines: [{ productId: product.id, quantity: count }],
  });
  const [order] = (await caller.orders.list({ status: "new" })).filter(
    (row) => row.token === token
  );
  await caller.orders.setStatus({ id: order.id, to: "accepted" });
  await caller.orders.setStatus({ id: order.id, to: "ready" });
  return { item, orderId: order.id };
};

describe("order stock router", () => {
  it("maps a product to stock items and removes them", async () => {
    const product = await caller.orders.createProduct({ name: randomUUID(), price: 500 });
    const item = await caller.stock.createAccount({ name: randomUUID(), unit: "g" });

    await caller.orderStock.setItem({ productId: product.id, accountId: item.id, quantity: 200 });
    expect(await caller.orderStock.items({ id: product.id })).toEqual([
      { accountId: item.id, name: item.name, unit: "g", quantity: 200 },
    ]);
    await caller.orderStock.removeItem({ productId: product.id, accountId: item.id });
    expect(await caller.orderStock.items({ id: product.id })).toEqual([]);
  });

  it("refuses a quantity that is not a whole number above zero", async () => {
    await expect(
      caller.orderStock.setItem({ productId: 1, accountId: 1, quantity: 0 })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
    await expect(
      caller.orderStock.setItem({ productId: 1, accountId: 1, quantity: 1.5 })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });

  it("fulfills a ready order, then refuses it again", async () => {
    const { item, orderId } = await readyOrder(5, 2);

    expect(await caller.orderStock.fulfill({ orderId, who: "Grace" })).toMatchObject({
      status: "fulfilled",
    });
    expect((await caller.stock.get({ id: item.id })).balance).toBe(3);
    await expect(caller.orderStock.fulfill({ orderId, who: "Grace" })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
    await expect(
      caller.orderStock.fulfill({ orderId: 2_000_000_000, who: "Grace" })
    ).rejects.toMatchObject(withCode("NOT_FOUND"));
  });

  it("names the item stock cannot cover", async () => {
    const { item, orderId } = await readyOrder(1, 2);

    await expect(caller.orderStock.fulfill({ orderId, who: "Grace" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining(item.name),
    });
    expect((await caller.orders.get({ id: orderId })).status).toBe("ready");
  });
});
