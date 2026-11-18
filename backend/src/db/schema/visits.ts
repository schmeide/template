import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { pipelineItems } from "./pipeline.ts";
import { newBookingSchema, schedulerBookings } from "./scheduler.ts";

// A deal and the bookings made for it, its visits. A booking belongs to at most one deal.
export const dealBookings = pgTable(
  "deal_bookings",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => pipelineItems.id),
    bookingId: integer("booking_id")
      .primaryKey()
      .references(() => schedulerBookings.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.itemId)]
);

// A slot as the bookings shape takes it, for a deal; the customer is the deal's contact.
export const bookVisitSchema = newBookingSchema
  .omit({ customerId: true })
  .extend(createInsertSchema(dealBookings).pick({ itemId: true }).shape);

export type BookVisit = z.input<typeof bookVisitSchema>;
