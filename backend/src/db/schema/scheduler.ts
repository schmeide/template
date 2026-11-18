import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers.ts";

export const bookingStatus = pgEnum("scheduler_booking_status", [
  "booked",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

// A person, room or piece of equipment that bookings are made against. Its availability is wall-clock
// time in its own IANA zone.
export const schedulerResources = pgTable("scheduler_resources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  kind: varchar("kind", { length: 100 }).notNull().default(""),
  timeZone: varchar("time_zone", { length: 64 }).notNull(),
});

// What is booked. Capacity above one makes it a class: that many bookings share one slot.
export const schedulerServices = pgTable(
  "scheduler_services",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    capacity: integer("capacity").notNull().default(1),
  },
  (table) => [
    check("scheduler_services_duration", sql`${table.durationMinutes} between 1 and 1440`),
    check("scheduler_services_buffer", sql`${table.bufferMinutes} between 0 and 1440`),
    check("scheduler_services_capacity", sql`${table.capacity} >= 1`),
  ]
);

// Weekly opening hours. Weekday 0 is Sunday.
export const schedulerAvailability = pgTable(
  "scheduler_availability",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => schedulerResources.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (table) => [
    index().on(table.resourceId),
    check("scheduler_availability_weekday", sql`${table.weekday} between 0 and 6`),
    check("scheduler_availability_order", sql`${table.startTime} < ${table.endTime}`),
  ]
);

// A date that replaces the weekly hours: closed when it has no times, one-off hours when it has.
export const schedulerExceptions = pgTable(
  "scheduler_exceptions",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => schedulerResources.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
  },
  (table) => [
    index().on(table.resourceId, table.date),
    check(
      "scheduler_exceptions_hours",
      sql`(${table.startTime} is null and ${table.endTime} is null) or coalesce(${table.startTime} < ${table.endTime}, false)`
    ),
  ]
);

// `seat` and `capacity` let the database hold the slot: live bookings that start together on one
// resource take distinct seats, and a seat cannot exceed the capacity copied from the service.
// ponytail: overlapping bookings with different starts are kept apart by the per-resource lock in
// the service, not by the database. The constraint for that is `exclude using gist (resource_id
// with =, tstzrange(starts_at, ends_at) with &&)`, which drizzle-kit cannot generate; add it to the
// schema once drizzle-kit supports exclusion constraints.
export const schedulerBookings = pgTable(
  "scheduler_bookings",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => schedulerResources.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => schedulerServices.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("booked"),
    seat: integer("seat").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.resourceId, table.startsAt),
    uniqueIndex("scheduler_bookings_one_per_seat")
      .on(table.resourceId, table.startsAt, table.seat)
      .where(sql`${table.status} <> 'cancelled'`),
    check("scheduler_bookings_order", sql`${table.startsAt} < ${table.endsAt}`),
    check("scheduler_bookings_seat", sql`${table.seat} between 1 and ${table.capacity}`),
  ]
);

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const day = z.iso.date();
const clock = z.iso.time({ precision: -1 });

export const newResourceSchema = createInsertSchema(schedulerResources, {
  name: (schema) => schema.trim().min(1),
  timeZone: (schema) => schema.refine(isTimeZone, "Not a known time zone"),
}).pick({ name: true, kind: true, timeZone: true });
export const resourceUpdateSchema = newResourceSchema.extend(
  createSelectSchema(schedulerResources).pick({ id: true }).shape
);

export const newServiceSchema = createInsertSchema(schedulerServices, {
  name: (schema) => schema.trim().min(1),
  durationMinutes: (schema) => schema.min(1).max(1440),
  bufferMinutes: (schema) => schema.min(0).max(1440).optional(),
  capacity: (schema) => schema.min(1).optional(),
}).pick({ name: true, durationMinutes: true, bufferMinutes: true, capacity: true });
export const serviceUpdateSchema = newServiceSchema.extend(
  createSelectSchema(schedulerServices).pick({ id: true }).shape
);

export const newRuleSchema = createInsertSchema(schedulerAvailability, {
  weekday: (schema) => schema.min(0).max(6),
  startTime: () => clock,
  endTime: () => clock,
})
  .pick({ resourceId: true, weekday: true, startTime: true, endTime: true })
  .refine((rule) => rule.startTime < rule.endTime, "The end must be after the start");

export const newExceptionSchema = createInsertSchema(schedulerExceptions, {
  date: () => day,
  startTime: () => clock.nullable().optional(),
  endTime: () => clock.nullable().optional(),
})
  .pick({ resourceId: true, date: true, startTime: true, endTime: true })
  .refine(
    ({ startTime, endTime }) =>
      (!startTime && !endTime) || (!!startTime && !!endTime && startTime < endTime),
    "Give no hours to close the day, or a start before the end"
  );

// Dates are calendar days in each resource's own zone.
export const rangeSchema = z
  .object({ from: day, to: day })
  .refine(({ from, to }) => from <= to, "The range ends before it starts")
  .refine(
    ({ from, to }) => Date.parse(to) - Date.parse(from) <= 62 * 86_400_000,
    "Ask for at most 62 days at a time"
  );

export const slotSearchSchema = rangeSchema.and(
  z.object({ serviceId: z.number().int(), resourceId: z.number().int().optional() })
);

const slotShape = createInsertSchema(schedulerBookings).pick({
  resourceId: true,
  serviceId: true,
  startsAt: true,
}).shape;

export const newBookingSchema = createInsertSchema(schedulerBookings)
  .pick({ customerId: true })
  .extend(slotShape);

const contactFields = createInsertSchema(customers, {
  name: (schema) => schema.trim().min(1),
  email: (schema) => schema.trim().pipe(z.email()),
}).pick({ name: true, email: true, phone: true });

// A booking from the public page: a slot and who it is for. It creates a customer.
export const publicBookingSchema = contactFields.extend(slotShape);

export const moveBookingSchema = createSelectSchema(schedulerBookings).pick({
  id: true,
  resourceId: true,
  startsAt: true,
});

export const statusSchema = createSelectSchema(schedulerBookings).pick({ id: true, status: true });

export type Resource = typeof schedulerResources.$inferSelect;
export type Service = typeof schedulerServices.$inferSelect;
export type Rule = typeof schedulerAvailability.$inferSelect;
export type Exception = typeof schedulerExceptions.$inferSelect;
export type Booking = typeof schedulerBookings.$inferSelect;
export type BookingStatus = Booking["status"];
export type NewResource = z.input<typeof newResourceSchema>;
export type ResourceUpdate = z.input<typeof resourceUpdateSchema>;
export type NewService = z.input<typeof newServiceSchema>;
export type ServiceUpdate = z.input<typeof serviceUpdateSchema>;
export type NewRule = z.input<typeof newRuleSchema>;
export type NewException = z.input<typeof newExceptionSchema>;
export type SlotSearch = z.input<typeof slotSearchSchema>;
export type NewBooking = z.input<typeof newBookingSchema>;
export type PublicBooking = z.input<typeof publicBookingSchema>;
export type MoveBooking = z.input<typeof moveBookingSchema>;
