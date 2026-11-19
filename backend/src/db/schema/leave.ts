import { integer, pgTable, unique, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { approvalRequests } from "./approval.ts";
import { ledgerAccounts, ledgerEntries } from "./ledger.ts";
import { people } from "./people.ts";

// Which balance a person's leave of one kind (the "Kind of leave" answer, such as Vacation) draws
// on. A kind with no row, such as Sick or Unpaid, draws on nothing.
export const leaveAccounts = pgTable(
  "leave_accounts",
  {
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    kind: varchar("kind", { length: 100 }).notNull(),
    accountId: integer("account_id")
      .notNull()
      .unique()
      .references(() => ledgerAccounts.id),
  },
  (table) => [unique().on(table.personId, table.kind)]
);

// The entry a request was taken off its balance with. A request posts once; reversing the entry
// leaves this row, so a correction is a new entry by hand.
export const leavePostings = pgTable("leave_postings", {
  requestId: integer("request_id")
    .notNull()
    .unique()
    .references(() => approvalRequests.id),
  entryId: integer("entry_id")
    .notNull()
    .unique()
    .references(() => ledgerEntries.id),
});

// A null account removes the row, so the kind draws on nothing.
export const setLeaveAccountSchema = createInsertSchema(leaveAccounts, {
  kind: (schema) => schema.trim().min(1),
}).extend({ accountId: z.number().int().nullable() });

export const personSchema = createSelectSchema(leaveAccounts).pick({ personId: true });
export const requestSchema = createSelectSchema(leavePostings).pick({ requestId: true });
export const accountSchema = createSelectSchema(leaveAccounts).pick({ accountId: true });

export type LeaveAccount = typeof leaveAccounts.$inferSelect;
export type SetLeaveAccount = z.input<typeof setLeaveAccountSchema>;
