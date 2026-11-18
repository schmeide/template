import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { documents } from "./documents.ts";
import { pipelineItems } from "./pipeline.ts";

// A deal's quotes and invoices. A document belongs to at most one deal; a deal has any number.
export const dealDocuments = pgTable(
  "deal_documents",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => pipelineItems.id),
    documentId: integer("document_id")
      .primaryKey()
      .references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.itemId)]
);

export const newDealDocumentSchema = createSelectSchema(dealDocuments)
  .pick({ itemId: true })
  .extend(createSelectSchema(documents).pick({ type: true }).shape);
