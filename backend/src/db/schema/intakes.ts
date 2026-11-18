import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { approvalRequests, approvalTypes, publicRequestSchema } from "./approval.ts";
import { customers } from "./customers.ts";

// An intake form sent to a customer. The token is the link's secret; `request_id` is set once,
// when the form comes back, so a link is used once.
export const customerIntakes = pgTable(
  "customer_intakes",
  {
    token: uuid("token").primaryKey().defaultRandom(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    typeId: integer("type_id")
      .notNull()
      .references(() => approvalTypes.id),
    requestId: integer("request_id")
      .unique()
      .references(() => approvalRequests.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.customerId)]
);

export const sendIntakeSchema = createInsertSchema(customerIntakes).pick({
  customerId: true,
  typeId: true,
});
export const intakeListSchema = createSelectSchema(customerIntakes).pick({ customerId: true });
export const intakeTokenSchema = createSelectSchema(customerIntakes).pick({ token: true });
// Public intake's own input with its honeypot, less the contact: the link already names who it is.
export const intakeSubmissionSchema = publicRequestSchema.omit({ contact: true });

export type Intake = typeof customerIntakes.$inferSelect;
export type SendIntake = z.input<typeof sendIntakeSchema>;
export type IntakeSubmission = z.input<typeof intakeSubmissionSchema>;
