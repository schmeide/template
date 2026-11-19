import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { customers } from "./customers.ts";

// A level a member joins at. Retired, never deleted, since periods refer to it.
export const membershipLevels = pgTable(
  "membership_levels",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    // Minor units (cents) per period.
    fee: integer("fee").notNull(),
    // Null for life.
    months: integer("months"),
    retired: boolean("retired").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("membership_levels_fee_not_negative", sql`${table.fee} >= 0`),
    check("membership_levels_months_positive", sql`${table.months} > 0`),
  ]
);

// One row per period a member paid for, with the level's name and fee copied, so changing a level
// later changes no existing period. Both days are included; `ends_on` is null for life.
export const membershipPeriods = pgTable(
  "membership_periods",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    levelId: integer("level_id")
      .notNull()
      .references(() => membershipLevels.id),
    levelName: varchar("level_name", { length: 100 }).notNull(),
    fee: integer("fee").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Also the index for a member's periods.
    uniqueIndex().on(table.customerId, table.startsOn),
    check("membership_periods_ends_after_starts", sql`${table.endsOn} > ${table.startsOn}`),
  ]
);

export const newLevelSchema = createInsertSchema(membershipLevels, {
  name: (schema) => schema.trim().min(1),
  fee: (schema) => schema.min(0),
  // A refined column loses its nullability, so restore it: null is for life.
  months: (schema) => schema.min(1).max(120).nullable(),
}).pick({ name: true, fee: true, months: true });

export const levelUpdateSchema = newLevelSchema.extend(
  createSelectSchema(membershipLevels).pick({ id: true }).shape
);

export const levelIdSchema = createSelectSchema(membershipLevels).pick({ id: true });

export type MemberStatus = "current" | "due" | "lapsed";

export const memberSchema = createSelectSchema(membershipPeriods).pick({ customerId: true });

// Joins or renews. `latestPeriodId` is the member's latest period as staff saw it (null to join),
// so a second click that finds a newer period adds nothing.
export const addPeriodSchema = createSelectSchema(membershipPeriods)
  .pick({ customerId: true, levelId: true })
  .extend({ latestPeriodId: createSelectSchema(membershipPeriods).shape.id.nullable() });

export type Level = typeof membershipLevels.$inferSelect;
export type Period = typeof membershipPeriods.$inferSelect;
export type NewLevel = z.input<typeof newLevelSchema>;
export type LevelUpdate = z.input<typeof levelUpdateSchema>;
export type AddPeriod = z.input<typeof addPeriodSchema>;
