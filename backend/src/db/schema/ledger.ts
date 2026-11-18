import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// In adds to the balance, out takes from it, adjust (a stock count) goes either way.
export const entryKind = pgEnum("ledger_entry_kind", ["in", "out", "adjust"]);

// An account is the thing with a balance: one stock item here. Its balance is never stored; it
// is the sum of its entries.
export const ledgerAccounts = pgTable("ledger_accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default(""),
  // No entry may take the balance below this. Null means no floor.
  floor: integer("floor").default(0),
  // The balance at or below which the account counts as low. Null means never low.
  lowAt: integer("low_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only: the service has no update or delete for entries. A reversal is another entry with
// the opposite quantity that names the entry it reverses, at most once (the unique constraint).
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    kind: entryKind("kind").notNull(),
    // Whole units, signed as it changes the balance.
    quantity: integer("quantity").notNull(),
    // A calendar day, not an instant.
    entryDate: date("entry_date").notNull(),
    // ponytail: free text because there is no users table; point it at users once sign-in exists.
    who: varchar("who", { length: 100 }).notNull().default(""),
    note: varchar("note", { length: 500 }).notNull().default(""),
    // Free text naming another record (a delivery note, an order number).
    reference: varchar("reference", { length: 100 }).notNull().default(""),
    reverses: integer("reverses")
      .unique()
      .references((): AnyPgColumn => ledgerEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.accountId, table.entryDate),
    index().on(table.entryDate),
    check("ledger_entries_quantity_not_zero", sql`${table.quantity} <> 0`),
    // A reversal flips the sign, so only original entries are held to their kind's sign.
    check(
      "ledger_entries_quantity_sign",
      sql`${table.reverses} is not null or ${table.kind} = 'adjust'
        or (${table.kind} = 'in' and ${table.quantity} > 0)
        or (${table.kind} = 'out' and ${table.quantity} < 0)`
    ),
  ]
);

export const newAccountSchema = createInsertSchema(ledgerAccounts, {
  name: (schema) => schema.trim().min(1),
}).pick({ name: true, unit: true, floor: true, lowAt: true });

export const accountUpdateSchema = newAccountSchema.extend(
  createSelectSchema(ledgerAccounts).pick({ id: true }).shape
);

// The same sign rule as the check constraint, so a wrong sign is a bad request, not a crash.
export const newEntrySchema = createInsertSchema(ledgerEntries, {
  entryDate: () => z.iso.date(),
})
  .pick({
    accountId: true,
    kind: true,
    quantity: true,
    entryDate: true,
    who: true,
    note: true,
    reference: true,
  })
  .refine(
    ({ kind, quantity }) =>
      kind === "in" ? quantity > 0 : kind === "out" ? quantity < 0 : quantity !== 0,
    { message: "In adds, out takes away, and an adjustment is not zero", path: ["quantity"] }
  );

export const reversalSchema = z.object({
  entryId: z.number().int(),
  ...createInsertSchema(ledgerEntries, { entryDate: () => z.iso.date() }).pick({
    entryDate: true,
    who: true,
    note: true,
  }).shape,
});

// Both days are included.
export const periodSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => from <= to, { message: "The period ends before it starts" });

export type Account = typeof ledgerAccounts.$inferSelect;
export type Entry = typeof ledgerEntries.$inferSelect;
export type NewAccount = z.input<typeof newAccountSchema>;
export type AccountUpdate = z.input<typeof accountUpdateSchema>;
export type NewEntry = z.input<typeof newEntrySchema>;
export type Reversal = z.input<typeof reversalSchema>;
export type Period = z.input<typeof periodSchema>;
