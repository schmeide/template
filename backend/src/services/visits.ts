import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import {
  schedulerBookings,
  schedulerResources,
  schedulerServices,
  type Booking,
} from "../db/schema/scheduler.ts";
import { dealBookings, type BookVisit } from "../db/schema/visits.ts";
import { createBooking } from "./scheduler.ts";

// Books a visit for a deal's contact and links it to the deal, in one transaction. The booking goes
// through the bookings shape's createBooking, so its resource lock and slot check still hold.
export const bookVisit = (
  db: Db,
  { itemId, ...slot }: Readonly<BookVisit>,
  now = new Date()
): Promise<Booking | "noDeal" | "noContact" | "taken"> =>
  db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ customerId: pipelineItems.customerId })
      .from(pipelineItems)
      .where(eq(pipelineItems.id, itemId));
    if (!deal) return "noDeal";
    if (deal.customerId === null) return "noContact";
    const booking = await createBooking(tx, { ...slot, customerId: deal.customerId }, now);
    if (!booking) return "taken";
    await tx.insert(dealBookings).values({ itemId, bookingId: booking.id });
    return booking;
  });

// A deal's visits as they now stand, moved or cancelled ones included.
export const listVisits = (db: Db, itemId: number) =>
  db
    .select({
      id: schedulerBookings.id,
      startsAt: schedulerBookings.startsAt,
      endsAt: schedulerBookings.endsAt,
      status: schedulerBookings.status,
      resourceId: schedulerBookings.resourceId,
      resourceName: schedulerResources.name,
      timeZone: schedulerResources.timeZone,
      serviceName: schedulerServices.name,
    })
    .from(dealBookings)
    .innerJoin(schedulerBookings, eq(dealBookings.bookingId, schedulerBookings.id))
    .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
    .innerJoin(schedulerServices, eq(schedulerBookings.serviceId, schedulerServices.id))
    .where(eq(dealBookings.itemId, itemId))
    .orderBy(asc(schedulerBookings.startsAt), asc(schedulerBookings.id));

// The deal a booking is a visit for, or null when it is not one.
export const getVisitDeal = async (db: Db, bookingId: number) => {
  const [deal] = await db
    .select({ id: pipelineItems.id, title: pipelineItems.title })
    .from(dealBookings)
    .innerJoin(pipelineItems, eq(dealBookings.itemId, pipelineItems.id))
    .where(eq(dealBookings.bookingId, bookingId));
  return deal ?? null;
};
