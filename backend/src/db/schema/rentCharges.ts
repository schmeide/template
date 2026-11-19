import { date, integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";
import { documents } from "./documents.ts";
import { leases } from "./leases.ts";

// The invoice that bills one rent period of a lease. Once the invoice is void the period is
// billed again, and its row points at the new invoice.
export const rentCharges = pgTable(
  "rent_charges",
  {
    leaseId: integer("lease_id")
      .notNull()
      .references(() => leases.id),
    // The period's first day.
    periodStart: date("period_start").notNull(),
    documentId: integer("document_id")
      .notNull()
      .unique()
      .references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.leaseId, table.periodStart] })]
);

// Bills every period that starts on or before `upTo`.
export const billRentSchema = z.object({ upTo: z.iso.date() });
