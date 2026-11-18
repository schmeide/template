import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { schedulerBookings, type NewService } from "../../db/schema/scheduler.ts";
import { createCustomer, listCustomers } from "../customers.ts";
import {
  addException,
  addRule,
  bookPublicly,
  createBooking,
  createResource,
  createService,
  deleteRule,
  findSlots,
  getAvailability,
  getBooking,
  listBookings,
  moveBooking,
  setStatus,
} from "../scheduler.ts";

// Tests share one database, so each makes its own resources and asserts only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const ny = "America/New_York";
// 2030-01-14 is a Monday. New York springs forward on Sunday 2030-03-10 and falls back on
// Sunday 2030-11-03.
const monday = "2030-01-14";
const at = (iso: string) => new Date(iso);
const iso = (slots: readonly { readonly startsAt: Date }[] | undefined) =>
  (slots ?? []).map((slot) => slot.startsAt.toISOString().slice(11, 16));

const newResource = (timeZone = ny) => createResource(db, { name: randomUUID(), timeZone });
const newService = (input: Partial<NewService> = {}) =>
  createService(db, { name: randomUUID(), durationMinutes: 60, ...input });
const newCustomer = () => createCustomer(db, { name: randomUUID() });

// A resource open 09:00 to 17:00 New York time on Mondays.
const openMondays = async (startTime = "09:00", endTime = "17:00") => {
  const resource = await newResource();
  await addRule(db, { resourceId: resource.id, weekday: 1, startTime, endTime });
  return resource;
};

const slotsOn = async (serviceId: number, resourceId: number, from: string, to = from) =>
  findSlots(db, { serviceId, resourceId, from, to });

const book = async (serviceId: number, resourceId: number, startsAt: Date) =>
  createBooking(db, { serviceId, resourceId, startsAt, customerId: (await newCustomer()).id });

describe("scheduler service", () => {
  it("offers slots inside the weekly hours in the resource's zone", async () => {
    const resource = await openMondays("09:00", "12:00");
    const service = await newService();

    const slots = await slotsOn(service.id, resource.id, "2030-01-13", "2030-01-15");

    // 09:00 New York in January is 14:00 UTC; a 60-minute service fits until 11:00.
    expect(iso(slots)).toEqual([
      "14:00",
      "14:15",
      "14:30",
      "14:45",
      "15:00",
      "15:15",
      "15:30",
      "15:45",
      "16:00",
    ]);
    expect(slots?.[0]).toMatchObject({
      resourceId: resource.id,
      resourceName: resource.name,
      timeZone: ny,
      endsAt: at("2030-01-14T15:00:00Z"),
      seatsLeft: 1,
    });
  });

  it("keeps a booking and the buffers on both sides of it free of other bookings", async () => {
    const resource = await openMondays();
    const service = await newService({ bufferMinutes: 30 });
    await book(service.id, resource.id, at("2030-01-14T17:00:00Z"));

    const times = iso(await slotsOn(service.id, resource.id, monday));

    // Booked 12:00 to 13:00 local with 30 minutes after; a new one needs 90 minutes clear.
    expect(times).toContain("15:30");
    expect(times).not.toContain("15:45");
    expect(times).not.toContain("18:15");
    expect(times).toContain("18:30");
  });

  it("uses a date's exceptions instead of its weekly hours", async () => {
    const resource = await openMondays();
    const service = await newService();
    await addException(db, { resourceId: resource.id, date: "2030-01-21" });
    await addException(db, {
      resourceId: resource.id,
      date: "2030-01-28",
      startTime: "13:00",
      endTime: "14:00",
    });
    await addException(db, {
      resourceId: resource.id,
      date: "2030-01-19",
      startTime: "10:00",
      endTime: "11:00",
    });

    expect(iso(await slotsOn(service.id, resource.id, "2030-01-21"))).toEqual([]);
    expect(iso(await slotsOn(service.id, resource.id, "2030-01-28"))).toEqual(["18:00"]);
    expect(iso(await slotsOn(service.id, resource.id, "2030-01-19"))).toEqual(["15:00"]);
  });

  it("skips slots that have already started", async () => {
    const resource = await openMondays("09:00", "11:00");
    const service = await newService();

    const slots = await findSlots(
      db,
      { serviceId: service.id, resourceId: resource.id, from: monday, to: monday },
      at("2030-01-14T14:20:00Z")
    );

    expect(iso(slots)).toEqual(["14:30", "14:45", "15:00"]);
  });

  it("follows the zone across the spring-forward day", async () => {
    const resource = await newResource();
    await addRule(db, {
      resourceId: resource.id,
      weekday: 0,
      startTime: "00:00",
      endTime: "05:00",
    });
    await addRule(db, {
      resourceId: resource.id,
      weekday: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    await addRule(db, {
      resourceId: resource.id,
      weekday: 5,
      startTime: "09:00",
      endTime: "10:00",
    });
    const service = await newService();

    const slots = await slotsOn(service.id, resource.id, "2030-03-08", "2030-03-11");

    // Friday 09:00 EST, then Sunday from 00:00 EST to 05:00 EDT (four real hours, no 02:xx),
    // then Monday 09:00 EDT.
    expect(slots?.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2030-03-08T14:00:00.000Z",
      ...["05", "06", "07"].flatMap((h) =>
        ["00", "15", "30", "45"].map((m) => `2030-03-10T${h}:${m}:00.000Z`)
      ),
      "2030-03-10T08:00:00.000Z",
      "2030-03-11T13:00:00.000Z",
    ]);
  });

  it("offers the repeated hour twice on the fall-back day", async () => {
    const resource = await newResource();
    await addRule(db, {
      resourceId: resource.id,
      weekday: 0,
      startTime: "00:00",
      endTime: "03:00",
    });
    const service = await newService({ durationMinutes: 30 });

    const slots = await slotsOn(service.id, resource.id, "2030-11-03");

    // 00:00 EDT is 04:00 UTC and 03:00 EST is 08:00 UTC: four real hours. 01:30 happens twice.
    expect(slots?.[0].startsAt).toEqual(at("2030-11-03T04:00:00Z"));
    expect(slots?.at(-1)?.startsAt).toEqual(at("2030-11-03T07:30:00Z"));
    expect(slots).toHaveLength(15);
    expect(iso(slots)).toContain("05:30");
    expect(iso(slots)).toContain("06:30");
  });

  it("books a free slot and refuses one that is taken, closed or off the grid", async () => {
    const resource = await openMondays();
    const service = await newService();
    const customer = await newCustomer();
    const startsAt = at("2030-01-14T15:00:00Z");

    const booking = await createBooking(db, {
      serviceId: service.id,
      resourceId: resource.id,
      startsAt,
      customerId: customer.id,
    });

    expect(booking).toMatchObject({ status: "booked", endsAt: at("2030-01-14T16:00:00Z") });
    expect(await book(service.id, resource.id, startsAt)).toBeUndefined();
    expect(await book(service.id, resource.id, at("2030-01-14T15:30:00Z"))).toBeUndefined();
    expect(await book(service.id, resource.id, at("2030-01-14T13:00:00Z"))).toBeUndefined();
    expect(await book(service.id, resource.id, at("2030-01-14T17:05:00Z"))).toBeUndefined();
    expect(await book(service.id, -1, startsAt)).toBeUndefined();
    expect(await book(-1, resource.id, startsAt)).toBeUndefined();
  });

  it("frees a slot when its booking is cancelled, and keeps cancelled bookings cancelled", async () => {
    const resource = await openMondays();
    const service = await newService();
    const startsAt = at("2030-01-14T15:00:00Z");
    const booking = await book(service.id, resource.id, startsAt);
    if (!booking) throw new Error("The slot was not free");

    expect(await setStatus(db, { id: booking.id, status: "confirmed" })).toMatchObject({
      status: "confirmed",
    });
    await setStatus(db, { id: booking.id, status: "cancelled" });

    expect(iso(await slotsOn(service.id, resource.id, monday))).toContain("15:00");
    expect(await book(service.id, resource.id, startsAt)).toBeDefined();
    expect(await setStatus(db, { id: booking.id, status: "booked" })).toBeUndefined();
    expect(await setStatus(db, { id: -1, status: "booked" })).toBeUndefined();
  });

  it("fills a class up to its capacity and keeps other services out of it", async () => {
    const resource = await openMondays("18:00", "19:00");
    const yoga = await newService({ capacity: 3 });
    const other = await newService();
    const startsAt = at("2030-01-14T23:00:00Z");

    const first = await book(yoga.id, resource.id, startsAt);
    expect((await slotsOn(yoga.id, resource.id, monday))?.[0]).toMatchObject({ seatsLeft: 2 });
    expect(await slotsOn(other.id, resource.id, monday)).toEqual([]);
    expect(await book(other.id, resource.id, startsAt)).toBeUndefined();
    const second = await book(yoga.id, resource.id, startsAt);
    const third = await book(yoga.id, resource.id, startsAt);

    expect([first?.seat, second?.seat, third?.seat]).toEqual([1, 2, 3]);
    expect(await book(yoga.id, resource.id, startsAt)).toBeUndefined();
    expect(await slotsOn(yoga.id, resource.id, monday)).toEqual([]);
  });

  it("lets only one of many simultaneous requests have a slot", async () => {
    const resource = await openMondays();
    const service = await newService();
    const startsAt = at("2030-01-14T15:00:00Z");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => book(service.id, resource.id, startsAt))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("fills a class exactly to capacity under simultaneous requests", async () => {
    const resource = await openMondays();
    const service = await newService({ capacity: 3 });
    const startsAt = at("2030-01-14T15:00:00Z");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => book(service.id, resource.id, startsAt))
    );

    expect(results.flatMap((booking) => (booking ? [booking.seat] : [])).toSorted()).toEqual([
      1, 2, 3,
    ]);
  });

  it("never overlaps bookings made at once for different starts", async () => {
    const resource = await openMondays();
    const service = await newService();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        book(
          service.id,
          resource.id,
          new Date(Date.parse("2030-01-14T14:00:00Z") + index * 900_000)
        )
      )
    );

    const booked = results.flatMap((booking) => (booking ? [booking] : []));
    expect(booked.length).toBeGreaterThan(0);
    const overlaps = booked.filter((a) =>
      booked.some((b) => a !== b && a.startsAt < b.endsAt && b.startsAt < a.endsAt)
    );
    expect(overlaps).toEqual([]);
  });

  it("has the database refuse a second live booking in one seat, or a seat past capacity", async () => {
    const resource = await openMondays();
    const service = await newService();
    const customer = await newCustomer();
    const row = {
      resourceId: resource.id,
      serviceId: service.id,
      customerId: customer.id,
      startsAt: at("2030-01-14T15:00:00Z"),
      endsAt: at("2030-01-14T16:00:00Z"),
      seat: 1,
      capacity: 1,
    };
    await db.insert(schedulerBookings).values(row);

    await expect(db.insert(schedulerBookings).values(row)).rejects.toMatchObject({
      cause: { code: "23505" },
    });
    await expect(db.insert(schedulerBookings).values({ ...row, seat: 2 })).rejects.toMatchObject({
      cause: { code: "23514" },
    });
    await db.execute(
      sql`update ${schedulerBookings} set status = 'cancelled' where resource_id = ${resource.id}`
    );
    await expect(db.insert(schedulerBookings).values(row)).resolves.toBeDefined();
  });

  it("moves a booking to a free slot, on another resource too, and frees the old one", async () => {
    const resource = await openMondays();
    const other = await openMondays();
    const service = await newService();
    const booking = await book(service.id, resource.id, at("2030-01-14T15:00:00Z"));
    const blocker = await book(service.id, resource.id, at("2030-01-14T17:00:00Z"));
    if (!booking || !blocker) throw new Error("The slots were not free");

    const later = { id: booking.id, resourceId: resource.id, startsAt: at("2030-01-14T15:30:00Z") };
    expect(await moveBooking(db, later)).toMatchObject({ endsAt: at("2030-01-14T16:30:00Z") });
    expect(
      await moveBooking(db, { ...later, startsAt: at("2030-01-14T16:30:00Z") })
    ).toBeUndefined();
    const moved = await moveBooking(db, { ...later, resourceId: other.id });

    expect(moved).toMatchObject({ resourceId: other.id });
    expect(iso(await slotsOn(service.id, resource.id, monday))).toContain("15:30");
    await setStatus(db, { id: blocker.id, status: "cancelled" });
    expect(await moveBooking(db, { ...later, id: blocker.id })).toBeUndefined();
    expect(await moveBooking(db, { ...later, id: -1 })).toBeUndefined();
  });

  it("books from the public page by creating the customer with the booking", async () => {
    const resource = await openMondays();
    const service = await newService();
    const name = randomUUID();
    const startsAt = at("2030-01-14T15:00:00Z");
    const input = {
      serviceId: service.id,
      resourceId: resource.id,
      startsAt,
      email: "a@example.com",
    };

    const booked = await bookPublicly(db, { ...input, name });
    const refused = await bookPublicly(db, { ...input, name: `${name}-again` });

    expect(booked).toEqual({
      id: expect.any(Number),
      startsAt,
      endsAt: at("2030-01-14T16:00:00Z"),
      serviceName: service.name,
      resourceName: resource.name,
      timeZone: ny,
    });
    expect(refused).toBeUndefined();
    const names = (await listCustomers(db)).map((customer) => customer.name);
    expect(names).toContain(name);
    expect(names).not.toContain(`${name}-again`);
    expect(await getBooking(db, booked?.id ?? -1)).toMatchObject({
      customer: { name, email: "a@example.com" },
      service: { id: service.id },
      resource: { id: resource.id },
    });
  });

  it("lists bookings by the day they fall on in their resource's zone", async () => {
    const resource = await newResource();
    await addRule(db, {
      resourceId: resource.id,
      weekday: 1,
      startTime: "23:00",
      endTime: "23:59",
    });
    const service = await newService({ durationMinutes: 30 });
    // 23:00 Monday in New York is 04:00 Tuesday UTC.
    const booking = await book(service.id, resource.id, at("2030-01-15T04:00:00Z"));

    const onMonday = await listBookings(db, { from: "2030-01-14", to: "2030-01-14" });
    const onTuesday = await listBookings(db, { from: "2030-01-15", to: "2030-01-15" });

    expect(onMonday.find((row) => row.id === booking?.id)).toMatchObject({
      date: "2030-01-14",
      resourceName: resource.name,
      serviceName: service.name,
      timeZone: ny,
      status: "booked",
    });
    expect(onTuesday.find((row) => row.id === booking?.id)).toBeUndefined();
  });

  it("keeps weekly hours and exceptions per resource", async () => {
    const resource = await openMondays();
    await addException(db, { resourceId: resource.id, date: "2030-12-25" });

    const { rules, exceptions } = await getAvailability(db, resource.id);
    expect(rules).toMatchObject([{ weekday: 1, startTime: "09:00:00", endTime: "17:00:00" }]);
    expect(exceptions).toMatchObject([{ date: "2030-12-25", startTime: null, endTime: null }]);

    expect(await deleteRule(db, rules[0].id)).toBeDefined();
    expect((await getAvailability(db, resource.id)).rules).toEqual([]);
    expect(
      await addRule(db, { resourceId: -1, weekday: 1, startTime: "09:00", endTime: "10:00" })
    ).toBeUndefined();
  });
});
