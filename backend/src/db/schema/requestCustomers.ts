import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { approvalRequests } from "./approval.ts";
import { customers, newCustomerSchema } from "./customers.ts";

// An approved request and the customer it was added to. A request appears at most once, so it
// converts once; a customer may have several requests.
export const requestCustomers = pgTable(
  "request_customers",
  {
    requestId: integer("request_id")
      .primaryKey()
      .references(() => approvalRequests.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.customerId)]
);

const requestShape = createSelectSchema(requestCustomers).pick({ requestId: true }).shape;

// The customer is one a person picked, or a new one they checked and saved. A public request's
// answers are free text, so the email is never matched to a customer.
export const convertToCustomerSchema = z.union([
  z.object({ ...requestShape, customerId: createSelectSchema(customers).shape.id }),
  z.object({ ...requestShape, customer: newCustomerSchema }),
]);

export type ConvertToCustomer = z.input<typeof convertToCustomerSchema>;
