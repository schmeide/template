import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

const parties = async () => {
  const unit = await caller.assets.create({ name: randomUUID() });
  const tenant = await caller.customers.create({ name: randomUUID() });
  return { recordId: unit.id, customerId: tenant.id };
};

describe("leases router", () => {
  it("lets a unit and lists the lease with its unit and tenant", async () => {
    const ids = await parties();

    const lease = await caller.leases.create({ ...ids, firstDay: "2026-01-01", rent: 95_000 });

    expect(await caller.leases.get({ id: lease.id })).toMatchObject({
      unit: { id: ids.recordId },
      tenant: { id: ids.customerId },
    });
    expect(await caller.leases.list({ today: "2026-02-01", recordId: ids.recordId })).toEqual([
      expect.objectContaining({ id: lease.id, state: "current" }),
    ]);
    expect(
      (await caller.leases.units({ today: "2026-02-01" })).find(({ id }) => id === ids.recordId)
    ).toMatchObject({ vacant: false });
  });

  it("refuses an overlap as a conflict that names the lease", async () => {
    const ids = await parties();
    const first = await caller.leases.create({ ...ids, firstDay: "2026-01-01", rent: 1 });

    await expect(
      caller.leases.create({ ...ids, firstDay: "2027-01-01", rent: 1 })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining(`lease ${first.id}`),
    });
  });

  it("validates dates and amounts", async () => {
    const ids = await parties();

    await expect(
      caller.leases.create({ ...ids, firstDay: "2026-02-01", lastDay: "2026-01-31", rent: 1 })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
    await expect(
      caller.leases.create({ ...ids, firstDay: "2026-02-30", rent: 1 })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
    await expect(
      caller.leases.create({ ...ids, firstDay: "2026-02-01", rent: -1 })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });

  it("ends and cancels, refusing what the rules forbid", async () => {
    const ids = await parties();
    const started = await caller.leases.create({
      ...ids,
      firstDay: "2026-01-01",
      lastDay: "2026-12-31",
      rent: 1,
    });
    const later = await caller.leases.create({ ...ids, firstDay: "2027-01-01", rent: 1 });
    const today = "2026-06-15";

    await expect(caller.leases.cancel({ id: started.id, today })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
    await expect(caller.leases.cancel({ id: later.id, today })).resolves.toMatchObject({
      cancelledAt: expect.any(Date),
    });
    await expect(
      caller.leases.end({ id: started.id, lastDay: "2025-12-31" })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
    await expect(
      caller.leases.end({ id: started.id, lastDay: "2026-11-30" })
    ).resolves.toMatchObject({ lastDay: "2026-11-30" });
    await expect(caller.leases.get({ id: 2_000_000_000 })).rejects.toMatchObject(
      withCode("NOT_FOUND")
    );
  });

  it("refuses a lease on an archived unit", async () => {
    const ids = await parties();
    await caller.assets.archive({ id: ids.recordId });

    await expect(
      caller.leases.create({ ...ids, firstDay: "2026-01-01", rent: 1 })
    ).rejects.toMatchObject(withCode("PRECONDITION_FAILED"));
  });
});
