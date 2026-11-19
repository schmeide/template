import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { documents } from "./documents.ts";
import { membershipPeriods } from "./membership.ts";

// Which invoice bills a membership period's dues. An invoice bills one period. A period may have
// more than one row once an invoice is void, so the service, not a constraint, keeps it on at most
// one invoice that is not void.
export const periodInvoices = pgTable(
  "period_invoices",
  {
    documentId: integer("document_id")
      .primaryKey()
      .references(() => documents.id),
    periodId: integer("period_id")
      .notNull()
      .references(() => membershipPeriods.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.periodId)]
);

export const billPeriodSchema = createSelectSchema(periodInvoices).pick({ periodId: true });
