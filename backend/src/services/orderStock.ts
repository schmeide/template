import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { catalogOrderLines, catalogOrders, type Order } from "../db/schema/catalog.ts";
import { ledgerAccounts, ledgerEntries } from "../db/schema/ledger.ts";
import {
  orderStockIssues,
  orderStockItems,
  type Fulfillment,
  type StockItemInput,
  type StockItemKey,
} from "../db/schema/orderStock.ts";
import { reference, setOrderStatus } from "./catalog.ts";

// "short" names the first item, in id order, that would go below its floor.
export type Refusal = "not allowed" | { readonly short: string };

// Today as a UTC calendar day.
const currentDate = () => new Date().toISOString().slice(0, 10);

// Postgres sums integers as bigint, which arrives as a string.
const sum = (column: typeof ledgerEntries.quantity) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

// The stock items a product uses, by name.
export const listStockItems = (db: Db, productId: number) =>
  db
    .select({
      accountId: orderStockItems.accountId,
      name: ledgerAccounts.name,
      unit: ledgerAccounts.unit,
      quantity: orderStockItems.quantity,
    })
    .from(orderStockItems)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, orderStockItems.accountId))
    .where(eq(orderStockItems.productId, productId))
    .orderBy(asc(ledgerAccounts.name), asc(ledgerAccounts.id));

// Adds the item to the product, or changes how much of it the product takes.
export const setStockItem = async (db: Db, input: Readonly<StockItemInput>): Promise<void> => {
  await db
    .insert(orderStockItems)
    .values(input)
    .onConflictDoUpdate({
      target: [orderStockItems.productId, orderStockItems.accountId],
      set: { quantity: input.quantity },
    });
};

export const removeStockItem = async (
  db: Db,
  { productId, accountId }: Readonly<StockItemKey>
): Promise<void> => {
  await db
    .delete(orderStockItems)
    .where(and(eq(orderStockItems.productId, productId), eq(orderStockItems.accountId, accountId)));
};

export const isIssued = async (db: Db, orderId: number): Promise<boolean> => {
  const [row] = await db
    .select({ orderId: orderStockIssues.orderId })
    .from(orderStockIssues)
    .where(eq(orderStockIssues.orderId, orderId));
  return row !== undefined;
};

// Takes a ready order out of stock and fulfills it, all or nothing: one "out" entry per stock item
// its products use, the order recorded as issued, and the order moved to fulfilled.
export const fulfillOrder = (
  db: Db,
  { orderId, who = "" }: Readonly<Fulfillment>,
  today = currentDate()
): Promise<Order | Refusal | undefined> =>
  db.transaction(async (tx) => {
    // The row lock makes a second fulfillment of the order wait, then find it fulfilled.
    const [order] = await tx
      .select()
      .from(catalogOrders)
      .where(eq(catalogOrders.id, orderId))
      .for("update");
    if (!order) return undefined;
    if (order.status !== "ready") return "not allowed";

    const needs = await tx
      .select({
        accountId: orderStockItems.accountId,
        quantity:
          sql<number>`sum(${catalogOrderLines.quantity} * ${orderStockItems.quantity})`.mapWith(
            Number
          ),
      })
      .from(catalogOrderLines)
      .innerJoin(orderStockItems, eq(orderStockItems.productId, catalogOrderLines.productId))
      .where(eq(catalogOrderLines.orderId, orderId))
      .groupBy(orderStockItems.accountId)
      .orderBy(asc(orderStockItems.accountId));

    if (needs.length > 0) {
      const ids = needs.map((need) => need.accountId);
      // Locked in id order, so two fulfillments that share items queue instead of deadlocking.
      const accounts = await tx
        .select()
        .from(ledgerAccounts)
        .where(inArray(ledgerAccounts.id, ids))
        .orderBy(asc(ledgerAccounts.id))
        .for("update");
      const balances = new Map(
        (
          await tx
            .select({ accountId: ledgerEntries.accountId, balance: sum(ledgerEntries.quantity) })
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.accountId, ids))
            .groupBy(ledgerEntries.accountId)
        ).map((row) => [row.accountId, row.balance])
      );
      const needed = new Map(needs.map((need) => [need.accountId, need.quantity]));
      const short = accounts.find(
        (account) =>
          account.floor !== null &&
          (balances.get(account.id) ?? 0) - (needed.get(account.id) ?? 0) < account.floor
      );
      if (short) return { short: short.name };

      await tx.insert(ledgerEntries).values(
        needs.map(({ accountId, quantity }) => ({
          accountId,
          kind: "out" as const,
          quantity: -quantity,
          entryDate: today,
          who,
          reference: reference(order.number),
        }))
      );
    }
    await tx.insert(orderStockIssues).values({ orderId });
    const fulfilled = await setOrderStatus(tx, orderId, "fulfilled");
    if (typeof fulfilled !== "object") throw new Error(`The order did not move: ${fulfilled}`);
    return fulfilled;
  });
