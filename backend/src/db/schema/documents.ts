import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers.ts";

// A type column keeps siblings (invoices and quotes) in one table with their own numbering.
export const documentType = pgEnum("document_type", ["invoice", "quote"]);
export const documentStatus = pgEnum("document_status", [
  "draft",
  "sent",
  "paid",
  "void",
  "accepted",
  "declined",
]);
export const paymentMethod = pgEnum("payment_method", [
  "bank transfer",
  "card",
  "cash",
  "check",
  "other",
]);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    type: documentType("type").notNull(),
    number: integer("number").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    issueDate: date("issue_date").notNull(),
    // A quote's valid-until date.
    dueDate: date("due_date").notNull(),
    status: documentStatus("status").notNull().default("draft"),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    // The public share link. A random UUID is unguessable (122 random bits).
    shareToken: uuid("share_token").notNull().unique().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.type, table.number),
    check("documents_due_after_issue", sql`${table.dueDate} >= ${table.issueDate}`),
  ]
);

// Amounts are integers: unit price in minor units (cents), quantity in thousandths, tax rate in
// basis points (2000 = 20%).
export const documentLines = pgTable(
  "document_lines",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    taxRate: integer("tax_rate").notNull().default(0),
  },
  (table) => [
    unique().on(table.documentId, table.position),
    check("document_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("document_lines_tax_rate_range", sql`${table.taxRate} between 0 and 10000`),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    method: paymentMethod("method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("payments_amount_positive", sql`${table.amount} > 0`)]
);

// The last number handed out per type. Incrementing this row inside the creating transaction
// numbers documents without gaps, even when two are created at once.
export const documentCounters = pgTable("document_counters", {
  type: documentType("type").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});

export const lineSchema = createInsertSchema(documentLines, {
  description: (schema) => schema.trim().min(1),
  quantity: (schema) => schema.positive(),
  taxRate: (schema) => schema.min(0).max(10_000),
}).pick({ description: true, quantity: true, unitPrice: true, taxRate: true });

const documentFields = createInsertSchema(documents, {
  issueDate: () => z.iso.date(),
  dueDate: () => z.iso.date(),
  // A refined column loses its optionality, so restore it for the defaulted currency.
  currency: (schema) => schema.regex(/^[A-Z]{3}$/).optional(),
})
  .pick({ customerId: true, issueDate: true, dueDate: true, notes: true, currency: true })
  .extend({ lines: z.array(lineSchema).max(200) });

const dueOnOrAfterIssue = (input: { readonly issueDate: string; readonly dueDate: string }) =>
  input.dueDate >= input.issueDate;
const dueDateMessage = {
  message: "The due date cannot be before the issue date",
  path: ["dueDate"],
};

export const documentInputSchema = documentFields.refine(dueOnOrAfterIssue, dueDateMessage);
export const documentUpdateSchema = documentFields
  .extend(createSelectSchema(documents).pick({ id: true }).shape)
  .refine(dueOnOrAfterIssue, dueDateMessage);

export const newPaymentSchema = createInsertSchema(payments, {
  amount: (schema) => schema.positive(),
  paidOn: () => z.iso.date(),
}).pick({ documentId: true, amount: true, paidOn: true, method: true });

export type DocumentType = (typeof documentType.enumValues)[number];
export type DocumentStatus = (typeof documentStatus.enumValues)[number];
export type Line = z.infer<typeof lineSchema>;
export type DocumentInput = z.input<typeof documentInputSchema>;
export type DocumentUpdate = z.input<typeof documentUpdateSchema>;
export type NewPayment = z.infer<typeof newPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
