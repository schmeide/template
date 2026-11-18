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
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers.ts";
import { registryRecords } from "./registry.ts";

export const rentPeriod = pgEnum("lease_rent_period", ["monthly", "weekly"]);

// A unit (a registry record) let to a tenant (a customer). Both days are included; no last day is
// a rolling lease. The service, not a constraint, keeps a unit's live leases from overlapping.
export const leases = pgTable(
  "leases",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => registryRecords.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    firstDay: date("first_day").notNull(),
    lastDay: date("last_day"),
    // Minor units (cents) per rent period.
    rent: integer("rent").notNull(),
    rentPeriod: rentPeriod("rent_period").notNull().default("monthly"),
    deposit: integer("deposit").notNull().default(0),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.recordId, table.firstDay),
    index().on(table.customerId),
    check("leases_last_day_after_first", sql`${table.lastDay} >= ${table.firstDay}`),
    check("leases_rent_not_negative", sql`${table.rent} >= 0`),
    check("leases_deposit_not_negative", sql`${table.deposit} >= 0`),
  ]
);

const endsAfterStart = ({ firstDay, lastDay }: { firstDay: string; lastDay?: string | null }) =>
  !lastDay || lastDay >= firstDay;
const endsBeforeStart = { message: "The last day is before the first day", path: ["lastDay"] };

const leaseFields = createInsertSchema(leases, {
  firstDay: () => z.iso.date(),
  lastDay: () => z.iso.date().nullable().optional(),
  rent: (schema) => schema.min(0),
  deposit: (schema) => schema.min(0).optional(),
}).pick({
  customerId: true,
  firstDay: true,
  lastDay: true,
  rent: true,
  rentPeriod: true,
  deposit: true,
  notes: true,
});

export const idSchema = createSelectSchema(leases).pick({ id: true });

// The unit is chosen once; a lease on the wrong unit is cancelled and made again.
export const newLeaseSchema = leaseFields
  .extend(createInsertSchema(leases).pick({ recordId: true }).shape)
  .refine(endsAfterStart, endsBeforeStart);

export const leaseUpdateSchema = leaseFields
  .extend(idSchema.shape)
  .refine(endsAfterStart, endsBeforeStart);

export const endLeaseSchema = idSchema.extend({ lastDay: z.iso.date() });

// `today` is the viewer's calendar day, sent by the browser.
export const todaySchema = z.object({ today: z.iso.date() });

export const cancelLeaseSchema = idSchema.extend(todaySchema.shape);

export const leaseFilterSchema = todaySchema.extend({
  recordId: z.number().int().optional(),
  customerId: z.number().int().optional(),
});

export type Lease = typeof leases.$inferSelect;
export type NewLease = z.input<typeof newLeaseSchema>;
export type LeaseUpdate = z.input<typeof leaseUpdateSchema>;
export type LeaseFilter = z.input<typeof leaseFilterSchema>;
