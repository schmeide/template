import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { catalogOrders, catalogProducts } from "./catalog.ts";
import { ledgerAccounts, ledgerEntries } from "./ledger.ts";

// One unit of the product takes `quantity` units of the stock item, in the item's unit. A product
// with no rows takes nothing from stock.
export const orderStockItems = pgTable(
  "order_stock_items",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => catalogProducts.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    unique().on(table.productId, table.accountId),
    check("order_stock_items_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

// The orders already taken out of stock, each once.
export const orderStockIssues = pgTable("order_stock_issues", {
  orderId: integer("order_id")
    .primaryKey()
    .references(() => catalogOrders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockItemSchema = createInsertSchema(orderStockItems, {
  quantity: (schema) => schema.min(1),
});
export const stockItemKeySchema = stockItemSchema.pick({ productId: true, accountId: true });

// `who` is the person fulfilling, written on each entry.
export const fulfillmentSchema = createSelectSchema(orderStockIssues)
  .pick({ orderId: true })
  .extend(
    createInsertSchema(ledgerEntries, { who: (schema) => schema.trim() }).pick({ who: true }).shape
  );

export type StockItemInput = z.input<typeof stockItemSchema>;
export type StockItemKey = z.input<typeof stockItemKeySchema>;
export type Fulfillment = z.input<typeof fulfillmentSchema>;
