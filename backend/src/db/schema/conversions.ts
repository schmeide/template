import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { documents } from "./documents.ts";

// A quote and the invoice made from it. Each side appears at most once, so a quote converts once.
export const documentConversions = pgTable("document_conversions", {
  quoteId: integer("quote_id")
    .primaryKey()
    .references(() => documents.id),
  invoiceId: integer("invoice_id")
    .notNull()
    .unique()
    .references(() => documents.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const convertSchema = createSelectSchema(documentConversions).pick({ quoteId: true });
