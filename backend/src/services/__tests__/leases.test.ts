import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { NewLease } from "../../db/schema/leases.ts";
import { createCustomer } from "../customers.ts";
import {
  cancelLease,
  createLease,
  endLease,
  getLease,
  listLeases,
  listUnits,
  updateLease,
} from "../leases.ts";
import { archiveRecord, createRecord } from "../registry.ts";

// Tests share one database, so each makes its own units and tenants and filters to them.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-06-15";

const newUnit = () => createRecord(db, { name: randomUUID() });
const newTenant = () => createCustomer(db, { name: randomUUID() });

const lease = async (fields: Partial<NewLease> = {}) => {
  const recordId = fields.recordId ?? (await newUnit()).id;
  const customerId = fields.customerId ?? (await newTenant()).id;
  const made = await createLease(db, {
    recordId,
    customerId,
    firstDay: "2026-01-01",
    lastDay: "2026-12-31",
    rent: 120_000,
    rentPeriod: "monthly",
    ...fields,
  });
  if (typeof made !== "object" || "clash" in made) {
    throw new Error(`The lease was refused: ${JSON.stringify(made)}`);
  }
  return made;
};

describe("leases service", () => {
  it("lets a unit to a tenant and reads it back with both names", async () => {
    const unit = await newUnit();
    const tenant = await newTenant();

    const made = await lease({ recordId: unit.id, customerId: tenant.id, deposit: 150_000 });

    expect(made).toMatchObject({ rent: 120_000, deposit: 150_000, cancelledAt: null });
    expect(await getLease(db, made.id)).toMatchObject({
      id: made.id,
      unit: { id: unit.id, name: unit.name, archivedAt: null },
      tenant: { id: tenant.id, name: tenant.name },
    });
  });

  it("refuses a lease that overlaps another on the same unit, naming it", async () => {
    const unit = await newUnit();
    const first = await lease({ recordId: unit.id, firstDay: "2026-01-01", lastDay: "2026-06-30" });

    expect(
      await createLease(db, {
        recordId: unit.id,
        customerId: first.customerId,
        firstDay: "2026-06-30",
        lastDay: null,
        rent: 1,
      })
    ).toEqual({ clash: expect.objectContaining({ id: first.id }) });
    // Both days are included, so the next lease may start the day after.
    await lease({ recordId: unit.id, firstDay: "2026-07-01", lastDay: null });
  });

  it("runs a rolling lease on forever", async () => {
    const unit = await newUnit();
    const rolling = await lease({ recordId: unit.id, firstDay: "2026-01-01", lastDay: null });

    expect(
      await createLease(db, {
        recordId: unit.id,
        customerId: rolling.customerId,
        firstDay: "2040-01-01",
        lastDay: "2040-12-31",
        rent: 1,
      })
    ).toEqual({ clash: expect.objectContaining({ id: rolling.id }) });
    expect(
      await createLease(db, {
        recordId: unit.id,
        customerId: rolling.customerId,
        firstDay: "2025-01-01",
        lastDay: "2025-12-31",
        rent: 1,
      })
    ).toMatchObject({ firstDay: "2025-01-01" });
  });

  it("lets other units overlap freely", async () => {
    const tenant = await newTenant();
    await lease({ customerId: tenant.id });
    await lease({ customerId: tenant.id });

    expect(await listLeases(db, { today, customerId: tenant.id })).toHaveLength(2);
  });

  it("lets one of several people letting the same unit at once, and refuses the rest", async () => {
    const unit = await newUnit();
    const tenant = await newTenant();

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createLease(db, {
          recordId: unit.id,
          customerId: tenant.id,
          firstDay: `2026-0${index + 1}-01`,
          lastDay: null,
          rent: 1,
        })
      )
    );

    const made = results.filter((result) => typeof result === "object" && !("clash" in result));
    expect(made).toHaveLength(1);
    expect(
      results.filter((result) => typeof result === "object" && "clash" in result)
    ).toHaveLength(3);
  });

  it("refuses a lease on an archived unit, or for a tenant or unit that does not exist", async () => {
    const unit = await newUnit();
    const tenant = await newTenant();
    await archiveRecord(db, unit.id);
    const input = { customerId: tenant.id, firstDay: "2026-01-01", rent: 1 };

    expect(await createLease(db, { ...input, recordId: unit.id })).toBe("unit archived");
    expect(await createLease(db, { ...input, recordId: 2_000_000_000 })).toBe("no unit");
    expect(
      await createLease(db, { ...input, recordId: (await newUnit()).id, customerId: 2_000_000_000 })
    ).toBe("no tenant");
  });

  it("shows an archived unit on a lease made before it was archived", async () => {
    const made = await lease();
    await archiveRecord(db, made.recordId);

    expect((await getLease(db, made.id))?.unit.archivedAt).toBeInstanceOf(Date);
  });

  it("edits a lease, checking its new dates against the unit's other leases but not itself", async () => {
    const unit = await newUnit();
    const first = await lease({ recordId: unit.id, firstDay: "2026-01-01", lastDay: "2026-03-31" });
    const second = await lease({ recordId: unit.id, firstDay: "2026-04-01", lastDay: null });
    const { id, customerId } = first;
    const fields = { id, customerId, rent: 99, rentPeriod: "weekly" as const, deposit: 0 };

    expect(
      await updateLease(db, { ...fields, firstDay: "2026-01-01", lastDay: "2026-04-01" })
    ).toEqual({ clash: expect.objectContaining({ id: second.id }) });
    expect(
      await updateLease(db, { ...fields, firstDay: "2025-12-01", lastDay: "2026-03-31" })
    ).toMatchObject({ firstDay: "2025-12-01", rent: 99, rentPeriod: "weekly" });
  });

  it("ends a lease by setting or moving its last day earlier, never before its first day", async () => {
    const rolling = await lease({ firstDay: "2026-01-01", lastDay: null });

    expect(await endLease(db, { id: rolling.id, lastDay: "2026-09-30" })).toMatchObject({
      lastDay: "2026-09-30",
    });
    expect(await endLease(db, { id: rolling.id, lastDay: "2026-08-31" })).toMatchObject({
      lastDay: "2026-08-31",
    });
    expect(await endLease(db, { id: rolling.id, lastDay: "2026-10-31" })).toBe("ends later");
    expect(await endLease(db, { id: rolling.id, lastDay: "2025-12-31" })).toBe("before first day");
    expect(await endLease(db, { id: 2_000_000_000, lastDay: "2026-10-31" })).toBe("no lease");
  });

  it("cancels a lease that has not started, which leaves the overlap check", async () => {
    const unit = await newUnit();
    const upcoming = await lease({ recordId: unit.id, firstDay: "2026-07-01", lastDay: null });

    const cancelled = await cancelLease(db, { id: upcoming.id, today });

    expect(cancelled).toMatchObject({ cancelledAt: expect.any(Date) });
    const again = await lease({ recordId: unit.id, firstDay: "2026-07-01", lastDay: null });
    expect(again.id).not.toBe(upcoming.id);
    expect(await getLease(db, upcoming.id)).toMatchObject({ cancelledAt: expect.any(Date) });
  });

  it("refuses to cancel a lease that has started, or to change a cancelled one", async () => {
    const started = await lease({ firstDay: today });
    const upcoming = await lease({ firstDay: "2026-07-01" });
    await cancelLease(db, { id: upcoming.id, today });

    expect(await cancelLease(db, { id: started.id, today })).toBe("started");
    expect(await cancelLease(db, { id: upcoming.id, today })).toBe("cancelled");
    expect(await endLease(db, { id: upcoming.id, lastDay: "2026-08-01" })).toBe("cancelled");
    expect(
      await updateLease(db, {
        id: upcoming.id,
        customerId: upcoming.customerId,
        firstDay: "2026-07-01",
        rent: 1,
      })
    ).toBe("cancelled");
  });

  it("lists leases as current, upcoming, ended or cancelled on the viewer's day", async () => {
    const unit = await newUnit();
    const ended = await lease({ recordId: unit.id, firstDay: "2025-01-01", lastDay: "2026-06-14" });
    const current = await lease({ recordId: unit.id, firstDay: today, lastDay: "2026-06-30" });
    const upcoming = await lease({ recordId: unit.id, firstDay: "2026-07-01", lastDay: null });
    await endLease(db, { id: upcoming.id, lastDay: "2026-12-31" });
    const cancelled = await lease({ recordId: unit.id, firstDay: "2027-01-01", lastDay: null });
    await cancelLease(db, { id: cancelled.id, today });

    const listed = await listLeases(db, { today, recordId: unit.id });

    expect(listed.map(({ id, state }) => [id, state])).toEqual([
      [cancelled.id, "cancelled"],
      [upcoming.id, "upcoming"],
      [current.id, "current"],
      [ended.id, "ended"],
    ]);
    expect(listed[0]).toMatchObject({ unitName: unit.name, tenantName: expect.any(String) });
  });

  it("filters leases by tenant", async () => {
    const tenant = await newTenant();
    const theirs = await lease({ customerId: tenant.id });
    await lease();

    expect(
      (await listLeases(db, { today, customerId: tenant.id })).map((listed) => listed.id)
    ).toEqual([theirs.id]);
  });

  it("lists units that are not archived, vacant when they have no current lease", async () => {
    const let_ = await lease({ firstDay: "2026-01-01", lastDay: null });
    const upcomingOnly = await lease({ firstDay: "2026-07-01", lastDay: null });
    const empty = await newUnit();
    const archived = await newUnit();
    await archiveRecord(db, archived.id);

    const units = new Map((await listUnits(db, today)).map((unit) => [unit.id, unit.vacant]));

    expect(units.get(let_.recordId)).toBe(false);
    expect(units.get(upcomingOnly.recordId)).toBe(true);
    expect(units.get(empty.id)).toBe(true);
    expect(units.has(archived.id)).toBe(false);
  });
});
