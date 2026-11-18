import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, lt, lte, ne, notInArray } from "drizzle-orm";
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
  type NewSeries,
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
import { addDays, instantOf, localDate, localTime, weekdayOf } from "./zonedTime.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const minute = 60_000;
// Slots start every quarter hour from the opening time.
const step = 15 * minute;
const live = ne(schedulerBookings.status, "cancelled");
const open = inArray(schedulerBookings.status, ["booked", "confirmed"]);

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
// `ignore` leaves bookings out, for moving them.
const freeSlots = async (
  tx: Tx,
  service: Service,
  resources: readonly Resource[],
  from: string,
  to: string,
  now: Date,
  ignore: readonly number[] = []
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
        notInArray(schedulerBookings.id, [...ignore]),
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
  ignore: readonly number[] = []
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
        notInArray(schedulerBookings.id, [...ignore])
      )
    );
  const seats = new Set(taken.map(({ seat }) => seat));
  let seat = 1;
  while (seats.has(seat)) seat += 1;
  return { endsAt: slot.endsAt, seat, capacity: service.capacity };
};

const insertBooking = (
  db: Db | Tx,
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

// ponytail: no reminders before a booking; sending them needs email and a job runner, a follow-up.
// Takes a transaction too, so a caller can write its own rows with the booking, atomically.
export const createBooking = async (
  db: Db | Tx,
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
      .where(and(eq(schedulerBookings.id, id), open))
      .for("update");
    if (!booking) return undefined;
    const placement = await place(tx, resource, booking.serviceId, startsAt, now, [id]);
    if (!placement) return undefined;
    const [moved] = await tx
      .update(schedulerBookings)
      .set({ resourceId, startsAt, ...placement })
      .where(eq(schedulerBookings.id, id))
      .returning();
    return moved;
  });

// What a series booking or move did: every booking, or none and the local dates that were not
// free. A series is all or nothing, so staff pick another time instead of tracking gaps.
export type SeriesResult = {
  readonly booked: readonly Booking[];
  readonly unfree: readonly string[];
};

// Places each start on `resource`, which the caller has locked. A series is a week or more apart
// and a booking with its buffer is at most two days, so its bookings never clash with each other.
const placeAll = async (
  tx: Tx,
  resource: Resource,
  serviceId: number,
  starts: readonly Date[],
  now: Date,
  ignore: readonly number[] = []
) => {
  const placements: (Placement | undefined)[] = [];
  for (const startsAt of starts) {
    placements.push(await place(tx, resource, serviceId, startsAt, now, ignore));
  }
  const unfree = starts.flatMap((startsAt, index) =>
    placements[index] ? [] : [localDate(startsAt, resource.timeZone)]
  );
  // When nothing is unfree there is one placement per start, in order.
  return { placements: placements.flatMap((placement) => placement ?? []), unfree };
};

// The same slot every `everyWeeks` weeks at the same wall-clock time, so 09:00 stays 09:00 across
// daylight-saving changes. Each booking is its own row, checked like a single booking under one
// lock of the resource; if any date is not free, nothing is booked.
export const createSeries = (
  db: Db,
  { customerId, resourceId, serviceId, startsAt, everyWeeks, count, until }: Readonly<NewSeries>,
  now = new Date()
): Promise<SeriesResult | undefined> =>
  db.transaction(async (tx) => {
    const resource = await lockResource(tx, resourceId);
    if (!resource || !(await findService(tx, serviceId))) return undefined;
    const date = localDate(startsAt, resource.timeZone);
    const time = localTime(startsAt, resource.timeZone);
    const dates = [date];
    for (
      let next = addDays(date, 7 * everyWeeks);
      count === undefined ? next <= (until ?? date) : dates.length < count;
      next = addDays(next, 7 * everyWeeks)
    ) {
      dates.push(next);
    }
    // The first start is the one asked for, so the second 01:30 on a fall-back day stays itself.
    const starts = dates.map((day, index) =>
      index === 0 ? startsAt : instantOf(day, time, resource.timeZone)
    );
    const { placements, unfree } = await placeAll(tx, resource, serviceId, starts, now);
    if (unfree.length > 0) return { booked: [], unfree };
    const seriesId = randomUUID();
    const booked = await tx
      .insert(schedulerBookings)
      .values(
        starts.map((start, index) => ({
          resourceId,
          serviceId,
          customerId,
          seriesId,
          startsAt: start,
          ...placements[index],
        }))
      )
      .returning();
    return {
      booked: booked.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      unfree,
    };
  });

// An open booking and the open bookings after it in its series (just the booking when it has no
// series), locked, earliest first, each with its resource's zone.
const withLater = async (tx: Tx, id: number) => {
  const [first] = await tx
    .select({ booking: schedulerBookings, timeZone: schedulerResources.timeZone })
    .from(schedulerBookings)
    .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
    .where(and(eq(schedulerBookings.id, id), open))
    .for("update", { of: schedulerBookings });
  if (!first?.booking.seriesId) return first ? [first] : [];
  return tx
    .select({ booking: schedulerBookings, timeZone: schedulerResources.timeZone })
    .from(schedulerBookings)
    .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
    .where(
      and(
        eq(schedulerBookings.seriesId, first.booking.seriesId),
        gte(schedulerBookings.startsAt, first.booking.startsAt),
        open
      )
    )
    .orderBy(asc(schedulerBookings.startsAt))
    .for("update", { of: schedulerBookings });
};

// Moves a booking and the open ones after it in its series by the same number of days, to the
// new wall-clock time on the target resource. All move, or none.
// ponytail: the moved bookings are checked against everything but each other, which holds while
// they stay a week apart. One moved alone to within two days of another could land overlapping it;
// place and update them one at a time, ignoring only those not yet moved, if that ever matters.
export const moveSeries = (
  db: Db,
  { id, resourceId, startsAt }: Readonly<MoveBooking>,
  now = new Date()
): Promise<SeriesResult | undefined> =>
  db.transaction(async (tx) => {
    const resource = await lockResource(tx, resourceId);
    if (!resource) return undefined;
    const rows = await withLater(tx, id);
    if (rows.length === 0) return undefined;
    const from = localDate(rows[0].booking.startsAt, rows[0].timeZone);
    const shift =
      (Date.parse(localDate(startsAt, resource.timeZone)) - Date.parse(from)) / 86_400_000;
    const time = localTime(startsAt, resource.timeZone);
    const starts = rows.map(({ booking, timeZone }, index) =>
      index === 0
        ? startsAt
        : instantOf(addDays(localDate(booking.startsAt, timeZone), shift), time, resource.timeZone)
    );
    const ids = rows.map(({ booking }) => booking.id);
    const { placements, unfree } = await placeAll(
      tx,
      resource,
      rows[0].booking.serviceId,
      starts,
      now,
      ids
    );
    if (unfree.length > 0) return { booked: [], unfree };
    const booked: Booking[] = [];
    for (const [index, bookingId] of ids.entries()) {
      const [moved] = await tx
        .update(schedulerBookings)
        .set({ resourceId, startsAt: starts[index], ...placements[index] })
        .where(eq(schedulerBookings.id, bookingId))
        .returning();
      booked.push(moved);
    }
    return { booked, unfree };
  });

// Cancels an open booking and the open ones after it in its series.
export const cancelSeries = (db: Db, id: number): Promise<readonly Booking[] | undefined> =>
  db.transaction(async (tx) => {
    const ids = (await withLater(tx, id)).map(({ booking }) => booking.id);
    if (ids.length === 0) return undefined;
    const cancelled = await tx
      .update(schedulerBookings)
      .set({ status: "cancelled" })
      .where(inArray(schedulerBookings.id, ids))
      .returning();
    return cancelled.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
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
  if (!row) return undefined;
  // Every booking in the series, this one included, so staff see the series from any of them.
  const series = row.booking.seriesId
    ? await db
        .select({
          id: schedulerBookings.id,
          startsAt: schedulerBookings.startsAt,
          endsAt: schedulerBookings.endsAt,
          status: schedulerBookings.status,
          timeZone: schedulerResources.timeZone,
        })
        .from(schedulerBookings)
        .innerJoin(schedulerResources, eq(schedulerBookings.resourceId, schedulerResources.id))
        .where(eq(schedulerBookings.seriesId, row.booking.seriesId))
        .orderBy(asc(schedulerBookings.startsAt))
    : [];
  return {
    ...row.booking,
    resource: row.resource,
    service: row.service,
    customer: row.customer,
    series,
  };
};
