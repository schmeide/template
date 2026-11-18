import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers.ts";
import { documents } from "./documents.ts";
import { ledgerAccounts, ledgerEntries } from "./ledger.ts";

// Who a ledger account is billed to, and at what rate. Billing locks this row.
export const billingAccounts = pgTable(
  "billing_accounts",
  {
    accountId: integer("account_id")
      .primaryKey()
      .references(() => ledgerAccounts.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    // Minor units (cents) per hour.
    rate: integer("rate").notNull(),
  },
  (table) => [check("billing_accounts_rate_not_negative", sql`${table.rate} >= 0`)]
);

// Which entries an invoice holds. An entry may appear again once its invoice is void, so the
// service, not a constraint, keeps it on at most one invoice that is not void.
export const billedEntries = pgTable(
  "billed_entries",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => ledgerEntries.id),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.documentId] }),
    index().on(table.documentId),
  ]
);

export const billingAccountSchema = createInsertSchema(billingAccounts, {
  rate: (schema) => schema.min(0),
}).pick({ accountId: true, customerId: true, rate: true });

// Both days are included.
export const billingPeriodSchema = createInsertSchema(billingAccounts)
  .pick({ accountId: true })
  .extend({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => from <= to, {
    message: "The period ends before it starts",
    path: ["to"],
  });

export type BillingAccount = typeof billingAccounts.$inferSelect;
export type BillingAccountInput = z.input<typeof billingAccountSchema>;
export type BillingPeriod = z.input<typeof billingPeriodSchema>;
