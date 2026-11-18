import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { approvalRequests } from "./approval.ts";
import { customers, newCustomerSchema } from "./customers.ts";
import { pipelineItems } from "./pipeline.ts";

// An approved request and the deal made from it. Each side appears at most once, so a request
// converts once.
export const requestDeals = pgTable("request_deals", {
  requestId: integer("request_id")
    .primaryKey()
    .references(() => approvalRequests.id),
  itemId: integer("item_id")
    .notNull()
    .unique()
    .references(() => pipelineItems.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const requestShape = createSelectSchema(requestDeals).pick({ requestId: true }).shape;

// The deal's customer is one a person picked, or a new one they typed in. A public request's
// contact is free text, so it is never matched to a customer.
export const convertRequestSchema = z.union([
  z.object({ ...requestShape, customerId: createSelectSchema(customers).shape.id }),
  z.object({ ...requestShape, customer: newCustomerSchema }),
]);

export type ConvertRequest = z.input<typeof convertRequestSchema>;
