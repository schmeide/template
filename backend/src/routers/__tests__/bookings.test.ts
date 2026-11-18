import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const badRequest = { code: "BAD_REQUEST" } satisfies Partial<TRPCError>;

describe("bookings router", () => {
  it("sets up a resource and service, finds a slot, books it publicly and moves it", async () => {
    const resource = await caller.bookings.createResource({
      name: `  ${randomUUID()}  `,
      timeZone: "Europe/Berlin",
    });
    const service = await caller.bookings.createService({ name: "Cut", durationMinutes: 30 });
    await caller.bookings.addRule({
      resourceId: resource.id,
      weekday: 1,
      startTime: "09:00",
      endTime: "10:00",
    });

    const slots = await caller.bookings.slots({
      serviceId: service.id,
      resourceId: resource.id,
      from: "2030-01-14",
      to: "2030-01-14",
    });
    const booked = await caller.bookings.book({
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: slots[0].startsAt,
      name: "  Ada  ",
      email: " ada@example.com ",
    });
    const moved = await caller.bookings.move({
      id: booked.id,
      resourceId: resource.id,
      startsAt: slots[1].startsAt,
    });

    expect(resource.name).not.toMatch(/^\s|\s$/);
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2030-01-14T08:00:00.000Z",
      "2030-01-14T08:15:00.000Z",
      "2030-01-14T08:30:00.000Z",
    ]);
    expect(Object.keys(booked).toSorted()).toEqual(
      ["endsAt", "id", "resourceName", "serviceName", "startsAt", "timeZone"].toSorted()
    );
    expect(moved.startsAt).toEqual(slots[1].startsAt);
    const detail = await caller.bookings.get({ id: booked.id });
    expect(detail.customer).toMatchObject({ name: "Ada", email: "ada@example.com" });
  });

  it("answers a taken slot with CONFLICT", async () => {
    const resource = await caller.bookings.createResource({ name: randomUUID(), timeZone: "UTC" });
    const service = await caller.bookings.createService({ name: "Fix", durationMinutes: 60 });
    await caller.bookings.addRule({
      resourceId: resource.id,
      weekday: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    const customer = await caller.customers.create({ name: randomUUID() });
    const input = {
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: new Date("2030-01-14T09:00:00Z"),
      customerId: customer.id,
    };
    await caller.bookings.create(input);

    await expect(caller.bookings.create(input)).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);
  });

  it("books, moves and cancels a series, and names the dates that are not free", async () => {
    const resource = await caller.bookings.createResource({ name: randomUUID(), timeZone: "UTC" });
    const service = await caller.bookings.createService({ name: "Fix", durationMinutes: 60 });
    await caller.bookings.addRule({
      resourceId: resource.id,
      weekday: 1,
      startTime: "09:00",
      endTime: "11:00",
    });
    const customer = await caller.customers.create({ name: randomUUID() });
    const input = {
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: new Date("2030-01-14T09:00:00Z"),
      customerId: customer.id,
      everyWeeks: 1,
      count: 2,
    };

    const booked = await caller.bookings.createSeries(input);
    await expect(caller.bookings.createSeries(input)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Not free on 2030-01-14, 2030-01-21. Nothing was booked.",
    } satisfies Partial<TRPCError>);
    const moved = await caller.bookings.moveSeries({
      id: booked[0].id,
      resourceId: resource.id,
      startsAt: new Date("2030-01-14T10:00:00Z"),
    });
    const cancelled = await caller.bookings.cancelSeries({ id: booked[0].id });

    expect(moved.map((booking) => booking.startsAt.getUTCHours())).toEqual([10, 10]);
    expect(cancelled.map((booking) => booking.status)).toEqual(["cancelled", "cancelled"]);
    await expect(caller.bookings.cancelSeries({ id: booked[0].id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });

  it.each([
    [
      "a series with both a count and an end date",
      () =>
        caller.bookings.createSeries({
          serviceId: 1,
          resourceId: 1,
          customerId: 1,
          startsAt: new Date("2030-01-14T09:00:00Z"),
          everyWeeks: 1,
          count: 2,
          until: "2030-02-01",
        }),
    ],
    [
      "a series of more than 52 bookings",
      () =>
        caller.bookings.createSeries({
          serviceId: 1,
          resourceId: 1,
          customerId: 1,
          startsAt: new Date("2030-01-14T09:00:00Z"),
          everyWeeks: 1,
          count: 53,
        }),
    ],
    [
      "a series that ends more than a year on",
      () =>
        caller.bookings.createSeries({
          serviceId: 1,
          resourceId: 1,
          customerId: 1,
          startsAt: new Date("2030-01-14T09:00:00Z"),
          everyWeeks: 1,
          until: "2031-02-01",
        }),
    ],
    [
      "an unknown time zone",
      () => caller.bookings.createResource({ name: "x", timeZone: "Mars/Base" }),
    ],
    ["a zero duration", () => caller.bookings.createService({ name: "x", durationMinutes: 0 })],
    [
      "a zero capacity",
      () => caller.bookings.createService({ name: "x", durationMinutes: 5, capacity: 0 }),
    ],
    [
      "hours that end before they start",
      () =>
        caller.bookings.addRule({
          resourceId: 1,
          weekday: 1,
          startTime: "10:00",
          endTime: "09:00",
        }),
    ],
    [
      "a weekday past Saturday",
      () =>
        caller.bookings.addRule({
          resourceId: 1,
          weekday: 7,
          startTime: "09:00",
          endTime: "10:00",
        }),
    ],
    [
      "an exception with only a start",
      () => caller.bookings.addException({ resourceId: 1, date: "2030-01-01", startTime: "09:00" }),
    ],
    [
      "a range of more than 62 days",
      () => caller.bookings.list({ from: "2030-01-01", to: "2030-06-01" }),
    ],
    [
      "a range that ends first",
      () => caller.bookings.list({ from: "2030-01-02", to: "2030-01-01" }),
    ],
    [
      "a public booking without an email",
      () =>
        caller.bookings.book({
          serviceId: 1,
          resourceId: 1,
          startsAt: new Date(),
          name: "x",
          email: "nope",
        }),
    ],
  ])("rejects %s", async (_label, call) => {
    await expect(call()).rejects.toMatchObject(badRequest);
  });

  it.each([
    ["get", () => caller.bookings.get({ id: -1 })],
    ["slots", () => caller.bookings.slots({ serviceId: -1, from: "2030-01-01", to: "2030-01-01" })],
    ["setStatus", () => caller.bookings.setStatus({ id: -1, status: "confirmed" })],
    [
      "updateResource",
      () => caller.bookings.updateResource({ id: -1, name: "x", timeZone: "UTC" }),
    ],
    [
      "updateService",
      () => caller.bookings.updateService({ id: -1, name: "x", durationMinutes: 5 }),
    ],
    ["deleteRule", () => caller.bookings.deleteRule({ id: -1 })],
    ["addException", () => caller.bookings.addException({ resourceId: -1, date: "2030-01-01" })],
  ])("answers %s for a missing id with NOT_FOUND", async (_label, call) => {
    await expect(call()).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });
});
