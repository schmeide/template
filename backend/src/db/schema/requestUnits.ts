import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { approvalRequests } from "./approval.ts";
import { registryRecords } from "./registry.ts";

// The unit (a registry record) a request is about. A request has at most one; a unit has many.
export const requestUnits = pgTable(
  "request_units",
  {
    requestId: integer("request_id")
      .primaryKey()
      .references(() => approvalRequests.id),
    recordId: integer("record_id")
      .notNull()
      .references(() => registryRecords.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.recordId)]
);

// No unit clears the request's unit.
export const setRequestUnitSchema = createInsertSchema(requestUnits)
  .pick({ requestId: true })
  .extend({ recordId: z.number().int().nullable() });

export type SetRequestUnit = z.input<typeof setRequestUnitSchema>;
