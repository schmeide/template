import { and, asc, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema/customers.ts";
import {
  schedulerAvailability,
  schedulerBookings,
  schedulerExceptions,
  schedulerResources,
  schedulerServices,
  type Booking,
  type BookingStatus,
  type Exception,
  type MoveBooking,
  type NewBooking,
  type NewException,
  type NewResource,
  type NewRule,
  type NewService,
  type PublicBooking,
  type Resource,
  type ResourceUpdate,
  type Rule,
  type Service,
  type ServiceUpdate,
  type SlotSearch,
} from "../db/schema/scheduler.ts";
import { addDays, instantOf, localDate, weekdayOf } from "./zonedTime.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const minute = 60_000;
// Slots start every quarter hour from the opening time.
const step = 15 * minute;
const live = ne(schedulerBookings.status, "cancelled");

export type Slot = {
  readonly resourceId: number;
  readonly resourceName: string;
  readonly timeZone: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly seatsLeft: number;
};

export const listResources = (db: Db): Promise<readonly Resource[]> =>
  db.select().from(schedulerResources).orderBy(asc(schedulerResources.name));

export const createResource = async (db: Db, input: Readonly<NewResource>): Promise<Resource> => {
  const [resource] = await db.insert(schedulerResources).values(input).returning();
  return resource;
};

export const updateResource = async (
  db: Db,
  { id, ...input }: Readonly<ResourceUpdate>
): Promise<Resource | undefined> => {
  const [resource] = await db
    .update(schedulerResources)
    .set({ ...input, kind: input.kind ?? "" })
    .where(eq(schedulerResources.id, id))
    .returning();
  return resource;
};

export const listServices = (db: Db): Promise<readonly Service[]> =>
  db.select().from(schedulerServices).orderBy(asc(schedulerServices.name));

export const createService = async (db: Db, input: Readonly<NewService>): Promise<Service> => {
  const [service] = await db.insert(schedulerServices).values(input).returning();
  return service;
};

export const updateService = async (
  db: Db,
  { id, ...input }: Readonly<ServiceUpdate>
): Promise<Service | undefined> => {
  const [service] = await db
    .update(schedulerServices)
    .set({ ...input, bufferMinutes: input.bufferMinutes ?? 0, capacity: input.capacity ?? 1 })
    .where(eq(schedulerServices.id, id))
    .returning();
  return service;
};

const hasResource = async (db: Db, id: number) =>
  (
    await db
      .select({ id: schedulerResources.id })
      .from(schedulerResources)
      .where(eq(schedulerResources.id, id))
  ).length > 0;

export const getAvailability = async (db: Db, resourceId: number) => ({
  rules: await db
    .select()
    .from(schedulerAvailability)
    .where(eq(schedulerAvailability.resourceId, resourceId))
    .orderBy(asc(schedulerAvailability.weekday), asc(schedulerAvailability.startTime)),
  // ponytail: past exceptions stay listed; hide or prune them when the list gets long.
  exceptions: await db
    .select()
    .from(schedulerExceptions)
    .where(eq(schedulerExceptions.resourceId, resourceId))
    .orderBy(asc(schedulerExceptions.date), asc(schedulerExceptions.startTime)),
});

export const addRule = async (db: Db, input: Readonly<NewRule>): Promise<Rule | undefined> => {
  if (!(await hasResource(db, input.resourceId))) return undefined;
  const [rule] = await db.insert(schedulerAvailability).values(input).returning();
  return rule;
};

export const deleteRule = async (db: Db, id: number): Promise<Rule | undefined> => {
  const [rule] = await db
    .delete(schedulerAvailability)
    .where(eq(schedulerAvailability.id, id))
    .returning();
  return rule;
};

export const addException = async (
  db: Db,
  input: Readonly<NewException>
): Promise<Exception | undefined> => {
  if (!(await hasResource(db, input.resourceId))) return undefined;
  const [exception] = await db
    .insert(schedulerExceptions)
    .values({ ...input, startTime: input.startTime ?? null, endTime: input.endTime ?? null })
    .returning();
  return exception;
};

export const deleteException = async (db: Db, id: number): Promise<Exception | undefined> => {
  const [exception] = await db
    .delete(schedulerExceptions)
    .where(eq(schedulerExceptions.id, id))
    .returning();
  return exception;
};

const midnightUtc = (date: string) => new Date(Date.parse(date));

// The free slots for `service` on `resources` from `from` to `to`, both calendar days in each
// resource's zone. A date with exceptions uses their hours (none when closed) instead of its weekly
// hours. Each opening is turned into instants on its own day, so daylight-saving changes give the
// real length of that day's hours. A slot is free when nothing live overlaps it and its buffer,
// or when the only overlaps are the same service at the same start with seats left (a class).
// `ignore` leaves one booking out, for moving it.
const freeSlots = async (
  tx: Tx,
  service: Service,
  resources: readonly Resource[],
  from: string,
  to: string,
  now: Date,
  ignore = -1
): Promise<readonly Slot[]> => {
  if (resources.length === 0) return [];
  const ids = resources.map((resource) => resource.id);
  const rules = await tx
    .select()
    .from(schedulerAvailability)
    .where(inArray(schedulerAvailability.resourceId, ids));
  const exceptions = await tx
    .select()
    .from(schedulerExceptions)
    .where(
      and(
        inArray(schedulerExceptions.resourceId, ids),
        gte(schedulerExceptions.date, from),
        lte(schedulerExceptions.date, to)
      )
    );
  // Wide enough for any zone's offset plus a day of buffer either side.
  const bookings = await tx
    .select({
      resourceId: schedulerBookings.resourceId,
      serviceId: schedulerBookings.serviceId,
      startsAt: schedulerBookings.startsAt,
      endsAt: schedulerBookings.endsAt,
      bufferMinutes: schedulerServices.bufferMinutes,
    })
    .from(schedulerBookings)
    .innerJoin(schedulerServices, eq(schedulerBookings.serviceId, schedulerServices.id))
    .where(
      and(
        inArray(schedulerBookings.resourceId, ids),
        live,
        ne(schedulerBookings.id, ignore),
        lt(schedulerBookings.startsAt, midnightUtc(addDays(to, 3))),
        gt(schedulerBookings.endsAt, midnightUtc(addDays(from, -2)))
      )
    );

  const length = service.durationMinutes * minute;
  const held = length + service.bufferMinutes * minute;
  const slots = new Map<string, Slot>();
  for (const resource of resources) {
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const own = exceptions.filter(
        (exception) => exception.resourceId === resource.id && exception.date === date
      );
      const hours =
        own.length > 0
          ? own.flatMap(({ startTime, endTime }) =>
              startTime && endTime ? [{ startTime, endTime }] : []
            )
          : rules.filter(
              (rule) => rule.resourceId === resource.id && rule.weekday === weekdayOf(date)
            );
      for (const { startTime, endTime } of hours) {
        const close = instantOf(date, endTime, resource.timeZone).getTime();
        for (
          let start = instantOf(date, startTime, resource.timeZone).getTime();
          start + length <= close;
          start += step
        ) {
          if (start < now.getTime()) continue;
          const overlapping = bookings.filter(
            (booking) =>
              booking.resourceId === resource.id &&
              booking.startsAt.getTime() < start + held &&
              start < booking.endsAt.getTime() + booking.bufferMinutes * minute
          );
          const shared = overlapping.every(
            (booking) => booking.serviceId === service.id && booking.startsAt.getTime() === start
          );
          const seatsLeft = shared ? service.capacity - overlapping.length : 0;
          if (seatsLeft > 0) {
            slots.set(`${resource.id}@${start}`, {
              resourceId: resource.id,
              resourceName: resource.name,
              timeZone: resource.timeZone,
              startsAt: new Date(start),
              endsAt: new Date(start + length),
              seatsLeft,
            });
          }
        }
      }
    }
  }
  return [...slots.values()].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.resourceName.localeCompare(b.resourceName)
  );
};

const findService = async (tx: Tx, id: number) => {
  const [service] = await tx.select().from(schedulerServices).where(eq(schedulerServices.id, id));
  return service;
};

export const findSlots = (
  db: Db,
  { serviceId, resourceId, from, to }: Readonly<SlotSearch>,
  now = new Date()
): Promise<readonly Slot[] | undefined> =>
  db.transaction(async (tx) => {
    const service = await findService(tx, serviceId);
    if (!service) return undefined;
    const resources = await tx
      .select()
      .from(schedulerResources)
      .where(resourceId === undefined ? undefined : eq(schedulerResources.id, resourceId))
      .orderBy(asc(schedulerResources.name));
    return freeSlots(tx, service, resources, from, to, now);
  });

// Every booking on a resource is placed while that resource's row is locked, so two requests for
// it queue and the second sees the first's booking. Lock the resource before any booking row.
const lockResource = async (tx: Tx, id: number) => {
  const [resource] = await tx
    .select()
    .from(schedulerResources)
    .where(eq(schedulerResources.id, id))
    .for("update");
  return resource;
};

type Placement = { readonly endsAt: Date; readonly seat: number; readonly capacity: number };

// Checks a requested start against the free slots, under the resource lock, and picks the lowest
// free seat. The database refuses a second live booking in a seat, or a seat past the capacity.
const place = async (
  tx: Tx,
  resource: Resource,
  serviceId: number,
  startsAt: Date,
  now: Date,
  ignore = -1
): Promise<Placement | undefined> => {
  const service = await findService(tx, serviceId);
  if (!service) return undefined;
  const date = localDate(startsAt, resource.timeZone);
  const slots = await freeSlots(tx, service, [resource], date, date, now, ignore);
  const slot = slots.find((candidate) => candidate.startsAt.getTime() === startsAt.getTime());
  if (!slot) return undefined;
  const taken = await tx
    .select({ seat: schedulerBookings.seat })
    .from(schedulerBookings)
    .where(
      and(
        eq(schedulerBookings.resourceId, resource.id),
        eq(schedulerBookings.startsAt, startsAt),
        live,
        ne(schedulerBookings.id, ignore)
      )
    );
  const seats = new Set(taken.map(({ seat }) => seat));
  let seat = 1;
  while (seats.has(seat)) seat += 1;
  return { endsAt: slot.endsAt, seat, capacity: service.capacity };
};

const insertBooking = (
  db: Db,
  { resourceId, serviceId, startsAt }: Readonly<Omit<NewBooking, "customerId">>,
  customerFor: (tx: Tx) => Promise<number>,
  now: Date
) =>
  db.transaction(async (tx) => {
    const resource = await lockResource(tx, resourceId);
    if (!resource) return undefined;
    const placement = await place(tx, resource, serviceId, startsAt, now);
    if (!placement) return undefined;
    const [booking] = await tx
      .insert(schedulerBookings)
      .values({ resourceId, serviceId, startsAt, customerId: await customerFor(tx), ...placement })
      .returning();
    return { booking, resource };
  });

// ponytail: one booking at a time; recurring bookings (the same slot every week) are a follow-up.
// ponytail: no reminders before a booking; sending them needs email and a job runner, a follow-up.
export const createBooking = async (
  db: Db,
  { customerId, ...slot }: Readonly<NewBooking>,
  now = new Date()
): Promise<Booking | undefined> =>
  (await insertBooking(db, slot, () => Promise.resolve(customerId), now))?.booking;

// The public page's booking: creates the customer in the same transaction, so a slot taken in the
// meantime leaves nothing behind. Returns only what the person booking may see.
// ponytail: every public booking creates a new customer; match returning customers once they can
// sign in or confirm their email.
export const bookPublicly = async (
  db: Db,
  { name, email, phone, ...slot }: Readonly<PublicBooking>,
  now = new Date()
) => {
  const result = await insertBooking(
    db,
    slot,
    async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({ name, email, phone })
        .returning({ id: customers.id });
      return customer.id;
    },
    now
  );
  if (!result) return undefined;
  const { booking, resource } = result;
  const [service] = await db
    .select({ name: schedulerServices.name })
    .from(schedulerServices)
    .where(eq(schedulerServices.id, booking.serviceId));
  return {
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    serviceName: service.name,
    resourceName: resource.name,
    timeZone: resource.timeZone,
  };
};

// Moves an open booking to a free slot, on the same or another resource. Only the target resource
// is locked: leaving a resource cannot clash with anything on it.
export const moveBooking = (
  db: Db,
  { id, resourceId, startsAt }: Readonly<MoveBooking>,
  now = new Date()
): Promise<Booking | undefined> =>
  db.transaction(async (tx) => {
    const resource = await lockResource(tx, resourceId);
    if (!resource) return undefined;
    const [booking] = await tx
      .select()
      .from(schedulerBookings)
      .where(
        and(
          eq(schedulerBookings.id, id),
          inArray(schedulerBookings.status, ["booked", "confirmed"])
        )
      )
      .for("update");
    if (!booking) return undefined;
    const placement = await place(tx, resource, booking.serviceId, startsAt, now, id);
    if (!placement) return undefined;
    const [moved] = await tx
      .update(schedulerBookings)
      .set({ resourceId, startsAt, ...placement })
      .where(eq(schedulerBookings.id, id))
      .returning();
    return moved;
  });

// Any status change except bringing a cancelled booking back, whose slot may be gone.
export const setStatus = async (
  db: Db,
  { id, status }: { readonly id: number; readonly status: BookingStatus }
): Promise<Booking | undefined> => {
  const [booking] = await db
    .update(schedulerBookings)
    .set({ status })
    .where(and(eq(schedulerBookings.id, id), live))
    .returning();
  return booking;
};

const bookingRow = {
  id: schedulerBookings.id,
  startsAt: schedulerBookings.startsAt,
  endsAt: schedulerBookings.endsAt,
  status: schedulerBookings.status,
  resourceId: schedulerBookings.resourceId,
  resourceName: schedulerResources.name,
  timeZone: schedulerResources.timeZone,
  serviceId: schedulerBookings.serviceId,
  serviceName: schedulerServices.name,
  customerName: customers.name,
};

// Bookings, cancelled ones included, whose start falls from `from` to `to` in their resource's
// zone, each with that local `date`.
export const listBookings = async (
  db: Db,
  { from, to }: { readonly from: string; readonly to: string }
) => {
  const rows = await db
    .select(bookingRow)
    .from(schedulerBookings)
    .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
    .innerJoin(schedulerServices, eq(schedulerBookings.serviceId, schedulerServices.id))
    .innerJoin(customers, eq(schedulerBookings.customerId, customers.id))
    .where(
      and(
        gte(schedulerBookings.startsAt, midnightUtc(addDays(from, -1))),
        lt(schedulerBookings.startsAt, midnightUtc(addDays(to, 2)))
      )
    )
    .orderBy(asc(schedulerBookings.startsAt), asc(schedulerResources.name));
  return rows
    .map((row) => ({ ...row, date: localDate(row.startsAt, row.timeZone) }))
    .filter(({ date }) => from <= date && date <= to);
};

export const getBooking = async (db: Db, id: number) => {
  const [row] = await db
    .select({
      booking: schedulerBookings,
      resource: schedulerResources,
      service: schedulerServices,
      customer: customers,
    })
    .from(schedulerBookings)
    .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
    .innerJoin(schedulerServices, eq(schedulerBookings.serviceId, schedulerServices.id))
    .innerJoin(customers, eq(schedulerBookings.customerId, customers.id))
    .where(eq(schedulerBookings.id, id));
  return (
    row && { ...row.booking, resource: row.resource, service: row.service, customer: row.customer }
  );
};
