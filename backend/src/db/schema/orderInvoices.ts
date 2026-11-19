import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { catalogOrders } from "./catalog.ts";
import { documents } from "./documents.ts";

// An order and an invoice made from it. An invoice belongs to one order; an order may have several,
// so the service, not a constraint, keeps it to at most one that is not void.
export const orderInvoices = pgTable(
  "order_invoices",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => catalogOrders.id),
    documentId: integer("document_id")
      .primaryKey()
      .references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.orderId)]
);

// Without `customerId`, a new customer is made from the order's name, email, phone and address.
export const invoiceOrderSchema = createInsertSchema(orderInvoices)
  .pick({ orderId: true })
  .extend({ customerId: z.number().int().optional() });

export type InvoiceOrder = z.input<typeof invoiceOrderSchema>;
