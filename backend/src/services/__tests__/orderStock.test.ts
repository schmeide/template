import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { catalogOrders, type Checkout } from "../../db/schema/catalog.ts";
import { createProduct, getOrder, placeOrder, setOrderStatus } from "../catalog.ts";
import { addEntry, createAccount, getAccount } from "../ledger.ts";
import {
  fulfillOrder,
  isIssued,
  listStockItems,
  removeStockItem,
  setStockItem,
} from "../orderStock.ts";

// Tests share one database, so each makes its own products, items and orders.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-04-01";

const newProduct = () => createProduct(db, { name: randomUUID(), price: 500 });

// A stock item holding `balance`, with a floor of zero unless given.
const newItem = async (balance: number, floor: number | null = 0) => {
  const item = await createAccount(db, { name: randomUUID(), unit: "g", floor });
  if (balance > 0) {
    await addEntry(db, { accountId: item.id, kind: "in", quantity: balance, entryDate: today });
  }
  return item;
};

// An order for the lines, moved on to `ready`.
const readyOrder = async (lines: Checkout["lines"]) => {
  const placed = await placeOrder(db, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    address: "12 Analytical Row",
    lines,
  });
  if (typeof placed !== "object") throw new Error(`The order was refused: ${placed}`);
  const [{ id }] = await db
    .select({ id: catalogOrders.id })
    .from(catalogOrders)
    .where(eq(catalogOrders.token, placed.token));
  await setOrderStatus(db, id, "accepted");
  await setOrderStatus(db, id, "ready");
  return id;
};

const fulfill = (orderId: number) => fulfillOrder(db, { orderId, who: "Grace" }, today);

const entriesOf = async (accountId: number) =>
  (await getAccount(db, accountId))?.entries.filter((entry) => entry.kind === "out") ?? [];

const balanceOf = async (accountId: number) => (await getAccount(db, accountId))?.balance;

const statusOf = async (orderId: number) => (await getOrder(db, orderId))?.status;

describe("order stock service", () => {
  it("maps a product to the stock items it uses, and changes and removes them", async () => {
    const pizza = await newProduct();
    const flour = await newItem(0);
    const cheese = await newItem(0);

    await setStockItem(db, { productId: pizza.id, accountId: flour.id, quantity: 200 });
    await setStockItem(db, { productId: pizza.id, accountId: cheese.id, quantity: 80 });
    await setStockItem(db, { productId: pizza.id, accountId: flour.id, quantity: 250 });

    expect(await listStockItems(db, pizza.id)).toEqual(
      [
        { accountId: flour.id, name: flour.name, unit: "g", quantity: 250 },
        { accountId: cheese.id, name: cheese.name, unit: "g", quantity: 80 },
      ].sort((a, b) => a.name.localeCompare(b.name))
    );

    await removeStockItem(db, { productId: pizza.id, accountId: flour.id });

    expect((await listStockItems(db, pizza.id)).map((item) => item.accountId)).toEqual([cheese.id]);
  });

  it("writes one out entry per item, summed over the lines, and fulfills the order", async () => {
    const pizza = await newProduct();
    const bread = await newProduct();
    const flour = await newItem(10_000);
    const cheese = await newItem(1000);
    await setStockItem(db, { productId: pizza.id, accountId: flour.id, quantity: 200 });
    await setStockItem(db, { productId: pizza.id, accountId: cheese.id, quantity: 80 });
    await setStockItem(db, { productId: bread.id, accountId: flour.id, quantity: 500 });
    const orderId = await readyOrder([
      { productId: pizza.id, quantity: 3 },
      { productId: bread.id, quantity: 2 },
    ]);

    const result = await fulfill(orderId);

    expect(result).toMatchObject({ id: orderId, status: "fulfilled" });
    const order = await getOrder(db, orderId);
    expect(await entriesOf(flour.id)).toEqual([
      expect.objectContaining({
        quantity: -(3 * 200 + 2 * 500),
        entryDate: today,
        who: "Grace",
        reference: order?.reference,
      }),
    ]);
    expect(await entriesOf(cheese.id)).toEqual([
      expect.objectContaining({ quantity: -240, reference: order?.reference }),
    ]);
    expect(await isIssued(db, orderId)).toBe(true);
  });

  it("fulfills an order whose products take nothing from stock", async () => {
    const service = await newProduct();
    const orderId = await readyOrder([{ productId: service.id, quantity: 1 }]);

    expect(await fulfill(orderId)).toMatchObject({ status: "fulfilled" });
    expect(await isIssued(db, orderId)).toBe(true);
  });

  it("fulfills only a ready order, and only once", async () => {
    const product = await newProduct();
    const item = await newItem(100);
    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 1 });
    const orderId = await readyOrder([{ productId: product.id, quantity: 1 }]);
    await setOrderStatus(db, orderId, "cancelled");

    expect(await fulfill(orderId)).toBe("not allowed");
    expect(await entriesOf(item.id)).toEqual([]);
    expect(await isIssued(db, orderId)).toBe(false);
    expect(await fulfillOrder(db, { orderId: 2_000_000_000, who: "" }, today)).toBeUndefined();

    const other = await readyOrder([{ productId: product.id, quantity: 1 }]);
    await fulfill(other);
    expect(await fulfill(other)).toBe("not allowed");
    expect(await entriesOf(item.id)).toHaveLength(1);
  });

  it("writes nothing and leaves the order ready when any item would go below its floor", async () => {
    const pizza = await newProduct();
    const flour = await newItem(10_000);
    const cheese = await newItem(100, 50);
    await setStockItem(db, { productId: pizza.id, accountId: flour.id, quantity: 200 });
    await setStockItem(db, { productId: pizza.id, accountId: cheese.id, quantity: 80 });
    const orderId = await readyOrder([{ productId: pizza.id, quantity: 1 }]);

    expect(await fulfill(orderId)).toEqual({ short: cheese.name });
    expect(await entriesOf(flour.id)).toEqual([]);
    expect(await entriesOf(cheese.id)).toEqual([]);
    expect(await statusOf(orderId)).toBe("ready");
    expect(await isIssued(db, orderId)).toBe(false);
  });

  it("takes an item with no floor below zero", async () => {
    const product = await newProduct();
    const item = await newItem(0, null);
    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 5 });
    const orderId = await readyOrder([{ productId: product.id, quantity: 2 }]);

    expect(await fulfill(orderId)).toMatchObject({ status: "fulfilled" });
    expect(await balanceOf(item.id)).toBe(-10);
  });

  it("applies a mapping change to later fulfillments only", async () => {
    const product = await newProduct();
    const item = await newItem(1000);
    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 10 });
    const first = await readyOrder([{ productId: product.id, quantity: 1 }]);
    const second = await readyOrder([{ productId: product.id, quantity: 1 }]);
    await fulfill(first);

    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 30 });
    await fulfill(second);

    expect((await entriesOf(item.id)).map((entry) => entry.quantity).sort()).toEqual([-10, -30]);
  });

  it("writes one set of entries when two people fulfill the same order at once", async () => {
    const product = await newProduct();
    const item = await newItem(100);
    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 3 });
    const orderId = await readyOrder([{ productId: product.id, quantity: 2 }]);

    const results = await Promise.all([fulfill(orderId), fulfill(orderId)]);

    expect(results.filter((result) => result === "not allowed")).toHaveLength(1);
    expect(await entriesOf(item.id)).toEqual([expect.objectContaining({ quantity: -6 })]);
    expect(await statusOf(orderId)).toBe("fulfilled");
  });

  it("lets only one of two orders sharing an item take its last units", async () => {
    const product = await newProduct();
    const item = await newItem(5);
    await setStockItem(db, { productId: product.id, accountId: item.id, quantity: 1 });
    const first = await readyOrder([{ productId: product.id, quantity: 4 }]);
    const second = await readyOrder([{ productId: product.id, quantity: 4 }]);

    const results = await Promise.all([fulfill(first), fulfill(second)]);

    expect(results).toContainEqual({ short: item.name });
    expect(results).toContainEqual(expect.objectContaining({ status: "fulfilled" }));
    expect(await balanceOf(item.id)).toBe(1);
  });

  it("fulfills two orders sharing items at once without deadlock", async () => {
    const pizza = await newProduct();
    const bread = await newProduct();
    const flour = await newItem(10_000);
    const salt = await newItem(10_000);
    await setStockItem(db, { productId: pizza.id, accountId: salt.id, quantity: 2 });
    await setStockItem(db, { productId: pizza.id, accountId: flour.id, quantity: 200 });
    await setStockItem(db, { productId: bread.id, accountId: flour.id, quantity: 500 });
    await setStockItem(db, { productId: bread.id, accountId: salt.id, quantity: 5 });
    const orders = await Promise.all([
      readyOrder([{ productId: pizza.id, quantity: 1 }]),
      readyOrder([{ productId: bread.id, quantity: 1 }]),
      readyOrder([
        { productId: bread.id, quantity: 1 },
        { productId: pizza.id, quantity: 1 },
      ]),
    ]);

    const results = await Promise.all(orders.map(fulfill));

    expect(results).toEqual(orders.map(() => expect.objectContaining({ status: "fulfilled" })));
    expect(await balanceOf(flour.id)).toBe(10_000 - 1400);
    expect(await balanceOf(salt.id)).toBe(10_000 - 14);
  });
});
