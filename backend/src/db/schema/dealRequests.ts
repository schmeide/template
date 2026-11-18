import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { approvalRequests, newRequestSchema } from "./approval.ts";
import { pipelineItems } from "./pipeline.ts";

// A deal's requests: checklists and inspections filed for the job. A request belongs to at most one
// deal; a deal has any number.
export const dealRequests = pgTable(
  "deal_requests",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => pipelineItems.id),
    requestId: integer("request_id")
      .primaryKey()
      .references(() => approvalRequests.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.itemId)]
);

// A new draft request of a type, by the person acting, for a deal.
export const newDealRequestSchema = createSelectSchema(dealRequests)
  .pick({ itemId: true })
  .extend(newRequestSchema.pick({ typeId: true, actorId: true }).shape);

export type NewDealRequest = z.input<typeof newDealRequestSchema>;
