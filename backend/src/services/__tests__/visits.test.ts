import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { dealBookings } from "../../db/schema/visits.ts";
import { createCustomer } from "../customers.ts";
import { addStage, createItem } from "../pipeline.ts";
import {
  addRule,
  createBooking,
  createResource,
  createService,
  moveBooking,
  setStatus,
} from "../scheduler.ts";
import { bookVisit, getVisitDeal, listVisits } from "../visits.ts";

// Tests share one database, so each makes its own deals, resources and services.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

// 2030-01-14 is a Monday; 15:00 UTC is 10:00 in New York.
const ten = new Date("2030-01-14T15:00:00Z");
const eleven = new Date("2030-01-14T16:00:00Z");
const now = new Date("2030-01-01T00:00:00Z");

const newDeal = async (withContact = true) => {
  const stage = await addStage(db, { name: randomUUID() });
  const customerId = withContact ? (await createCustomer(db, { name: randomUUID() })).id : null;
  const deal = await createItem(db, { title: randomUUID(), stageId: stage.id, customerId });
  if (!deal) throw new Error("The stage is missing");
  return deal;
};

// A technician open 09:00 to 17:00 New York time on Mondays, and a 60-minute job type.
const newSlot = async () => {
  const resource = await createResource(db, {
    name: randomUUID(),
    timeZone: "America/New_York",
  });
  await addRule(db, { resourceId: resource.id, weekday: 1, startTime: "09:00", endTime: "17:00" });
  const service = await createService(db, { name: randomUUID(), durationMinutes: 60 });
  return { resourceId: resource.id, serviceId: service.id };
};

const linksTo = async (bookingId: number) =>
  db.select().from(dealBookings).where(eq(dealBookings.bookingId, bookingId));

describe("visits service", () => {
  it("books a visit for the deal's contact and lists it on the deal", async () => {
    const deal = await newDeal();
    const slot = await newSlot();

    const booking = await bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now);

    expect(booking).toMatchObject({ customerId: deal.customerId, startsAt: ten, status: "booked" });
    if (typeof booking === "string") throw new Error(booking);
    expect(await listVisits(db, deal.id)).toMatchObject([
      { id: booking.id, startsAt: ten, status: "booked", resourceId: slot.resourceId },
    ]);
    expect(await getVisitDeal(db, booking.id)).toEqual({ id: deal.id, title: deal.title });
  });

  it("gives a deal any number of visits, in time order", async () => {
    const deal = await newDeal();
    const slot = await newSlot();

    await bookVisit(db, { itemId: deal.id, ...slot, startsAt: eleven }, now);
    await bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now);

    expect((await listVisits(db, deal.id)).map((visit) => visit.startsAt)).toEqual([ten, eleven]);
  });

  it("refuses a deal with no contact, and books nothing", async () => {
    const deal = await newDeal(false);
    const slot = await newSlot();

    expect(await bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now)).toBe("noContact");
    expect(await listVisits(db, deal.id)).toEqual([]);
    // The slot is still free for anyone else.
    const customer = await createCustomer(db, { name: randomUUID() });
    expect(
      await createBooking(db, { ...slot, startsAt: ten, customerId: customer.id }, now)
    ).toBeDefined();
  });

  it("refuses a deal that does not exist", async () => {
    const slot = await newSlot();

    expect(await bookVisit(db, { itemId: -1, ...slot, startsAt: ten }, now)).toBe("noDeal");
  });

  it("refuses a taken slot through the bookings rules, and links nothing", async () => {
    const deal = await newDeal();
    const slot = await newSlot();
    const customer = await createCustomer(db, { name: randomUUID() });
    await createBooking(db, { ...slot, startsAt: ten, customerId: customer.id }, now);

    expect(await bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now)).toBe("taken");
    expect(await listVisits(db, deal.id)).toEqual([]);
  });

  it("lets exactly one of two deals booked into the same slot at once have it", async () => {
    const first = await newDeal();
    const second = await newDeal();
    const slot = await newSlot();

    const results = await Promise.all(
      [first, second].map((deal) => bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now))
    );

    expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
    expect(results.filter((result) => result === "taken")).toHaveLength(1);
    const visits = [...(await listVisits(db, first.id)), ...(await listVisits(db, second.id))];
    expect(visits).toHaveLength(1);
  });

  it("links a booking to at most one deal", async () => {
    const first = await newDeal();
    const second = await newDeal();
    const slot = await newSlot();
    const booking = await bookVisit(db, { itemId: first.id, ...slot, startsAt: ten }, now);
    if (typeof booking === "string") throw new Error(booking);

    await expect(
      db.insert(dealBookings).values({ itemId: second.id, bookingId: booking.id })
    ).rejects.toThrow();
    expect(await linksTo(booking.id)).toHaveLength(1);
  });

  it("keeps the link when the booking is moved or cancelled, showing it as it now stands", async () => {
    const deal = await newDeal();
    const slot = await newSlot();
    const booking = await bookVisit(db, { itemId: deal.id, ...slot, startsAt: ten }, now);
    if (typeof booking === "string") throw new Error(booking);

    await moveBooking(db, { id: booking.id, resourceId: slot.resourceId, startsAt: eleven }, now);
    expect(await listVisits(db, deal.id)).toMatchObject([{ id: booking.id, startsAt: eleven }]);

    await setStatus(db, { id: booking.id, status: "cancelled" });
    expect(await listVisits(db, deal.id)).toMatchObject([
      { id: booking.id, startsAt: eleven, status: "cancelled" },
    ]);
    expect(await getVisitDeal(db, booking.id)).toEqual({ id: deal.id, title: deal.title });
  });

  it("returns null for a booking that is not a visit", async () => {
    const slot = await newSlot();
    const customer = await createCustomer(db, { name: randomUUID() });
    const booking = await createBooking(
      db,
      { ...slot, startsAt: ten, customerId: customer.id },
      now
    );
    if (!booking) throw new Error("The slot is taken");

    expect(await getVisitDeal(db, booking.id)).toBeNull();
  });
});
