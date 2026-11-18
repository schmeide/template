import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

// 2030-01-14 is a Monday; 15:00 UTC is 10:00 in New York.
const startsAt = new Date("2030-01-14T15:00:00Z");

const newDeal = async (withContact = true) => {
  const stage = await caller.deals.addStage({ name: randomUUID() });
  const customerId = withContact
    ? (await caller.customers.create({ name: randomUUID() })).id
    : null;
  return caller.deals.create({ title: randomUUID(), stageId: stage.id, customerId });
};

const newSlot = async () => {
  const resource = await caller.bookings.createResource({
    name: randomUUID(),
    timeZone: "America/New_York",
  });
  await caller.bookings.addRule({
    resourceId: resource.id,
    weekday: 1,
    startTime: "09:00",
    endTime: "17:00",
  });
  const service = await caller.bookings.createService({ name: randomUUID(), durationMinutes: 60 });
  return { resourceId: resource.id, serviceId: service.id, startsAt };
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("visits router", () => {
  it("books a visit and reports it from the deal and the booking", async () => {
    const deal = await newDeal();

    const booking = await caller.visits.book({ itemId: deal.id, ...(await newSlot()) });

    expect((await caller.visits.list({ itemId: deal.id })).map((visit) => visit.id)).toEqual([
      booking.id,
    ]);
    expect(await caller.visits.deal({ bookingId: booking.id })).toEqual({
      id: deal.id,
      title: deal.title,
    });
  });

  it("refuses a deal with no contact, a missing deal and a taken slot", async () => {
    const slot = await newSlot();

    await expect(
      caller.visits.book({ itemId: (await newDeal(false)).id, ...slot })
    ).rejects.toMatchObject(withCode("PRECONDITION_FAILED"));
    await expect(caller.visits.book({ itemId: -1, ...slot })).rejects.toMatchObject(
      withCode("NOT_FOUND")
    );
    await caller.visits.book({ itemId: (await newDeal()).id, ...slot });
    await expect(
      caller.visits.book({ itemId: (await newDeal()).id, ...slot })
    ).rejects.toMatchObject(withCode("CONFLICT"));
  });

  it("validates the input", async () => {
    await expect(
      caller.visits.book({ itemId: 1.5, resourceId: 1, serviceId: 1, startsAt })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });
});
