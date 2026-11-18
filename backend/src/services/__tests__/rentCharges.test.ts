import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { NewLease } from "../../db/schema/leases.ts";
import { createCustomer } from "../customers.ts";
import { getDocument, setStatus } from "../documents.ts";
import { cancelLease, createLease, updateLease } from "../leases.ts";
import { createRecord } from "../registry.ts";
import { billRent, chargesForLease, chargeForInvoice, rentPeriods } from "../rentCharges.ts";

// Tests share one database, and a run bills every lease in it, so each test makes its own lease
// and reads only that lease's charges.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-03-15";

const lease = async (fields: Partial<NewLease> = {}) => {
  const unit = await createRecord(db, { name: randomUUID() });
  const tenant = await createCustomer(db, { name: randomUUID() });
  const made = await createLease(db, {
    recordId: unit.id,
    customerId: tenant.id,
    firstDay: "2026-01-01",
    lastDay: null,
    rent: 100_000,
    rentPeriod: "monthly",
    ...fields,
  });
  if (typeof made !== "object" || "clash" in made) throw new Error("The lease was refused");
  return made;
};

const charged = async (leaseId: number) =>
  (await chargesForLease(db, leaseId)).map(({ periodStart, periodEnd }) => [
    periodStart,
    periodEnd,
  ]);

describe("rent periods", () => {
  it("starts monthly periods on the first day's day of the month, clamped to the month's end", () => {
    expect(
      rentPeriods({ firstDay: "2026-01-31", lastDay: null, rentPeriod: "monthly" }, "2026-04-30")
    ).toEqual([
      { start: "2026-01-31", end: "2026-02-27" },
      { start: "2026-02-28", end: "2026-03-30" },
      { start: "2026-03-31", end: "2026-04-29" },
      { start: "2026-04-30", end: "2026-05-30" },
    ]);
  });

  it("counts from the first day across a leap year, not from the previous period", () => {
    expect(
      rentPeriods(
        { firstDay: "2028-01-30", lastDay: null, rentPeriod: "monthly" },
        "2028-03-30"
      ).map(({ start }) => start)
    ).toEqual(["2028-01-30", "2028-02-29", "2028-03-30"]);
  });

  it("starts weekly periods every 7 days from the first day", () => {
    expect(
      rentPeriods({ firstDay: "2026-02-20", lastDay: null, rentPeriod: "weekly" }, "2026-03-06")
    ).toEqual([
      { start: "2026-02-20", end: "2026-02-26" },
      { start: "2026-02-27", end: "2026-03-05" },
      { start: "2026-03-06", end: "2026-03-12" },
    ]);
  });

  it("stops at the lease's last day, keeping the period it cuts short whole", () => {
    expect(
      rentPeriods(
        { firstDay: "2026-01-10", lastDay: "2026-02-15", rentPeriod: "monthly" },
        "2026-12-31"
      )
    ).toEqual([
      { start: "2026-01-10", end: "2026-02-09" },
      { start: "2026-02-10", end: "2026-03-09" },
    ]);
  });

  it("has none before the first day", () => {
    expect(
      rentPeriods({ firstDay: "2026-05-01", lastDay: null, rentPeriod: "monthly" }, "2026-04-30")
    ).toEqual([]);
  });
});

describe("rent charges service", () => {
  it("makes a draft invoice per period due, for the tenant at the rent with no tax", async () => {
    const made = await lease({ firstDay: "2026-01-31", rent: 123_400 });

    await billRent(db, "2026-03-31", today);

    const charges = await chargesForLease(db, made.id);
    expect(charges.map(({ periodStart }) => periodStart)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    const february = await getDocument(db, "invoice", charges[1].invoice.id, today);
    expect(february).toMatchObject({
      status: "draft",
      customerId: made.customerId,
      issueDate: "2026-02-28",
      dueDate: "2026-02-28",
      total: 123_400,
      tax: 0,
    });
    expect(february?.lines.map(({ description, quantity }) => [description, quantity])).toEqual([
      ["Rent 2026-02-28 to 2026-03-30", 1000],
    ]);
    // A period billed ahead is issued on the day of the run and due on its first day.
    expect(await getDocument(db, "invoice", charges[2].invoice.id, today)).toMatchObject({
      issueDate: today,
      dueDate: "2026-03-31",
    });
  });

  it("bills a period once: a second run makes nothing for it", async () => {
    const made = await lease();
    await billRent(db, "2026-02-01", today);
    const first = await chargesForLease(db, made.id);

    await billRent(db, "2026-02-01", today);

    expect(await chargesForLease(db, made.id)).toEqual(first);
    expect(first).toHaveLength(2);
  });

  it("makes one invoice per period when two runs happen at once", async () => {
    const made = await lease({ rentPeriod: "weekly" });

    await Promise.all(Array.from({ length: 3 }, () => billRent(db, "2026-01-29", today)));

    const charges = await chargesForLease(db, made.id);
    expect(charges.map(({ periodStart }) => periodStart)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
    ]);
    expect(new Set(charges.map(({ invoice }) => invoice.id)).size).toBe(5);
  });

  it("bills a period again once its invoice is void, pointing the charge at the new invoice", async () => {
    const made = await lease();
    await billRent(db, "2026-01-01", today);
    const [voided] = await chargesForLease(db, made.id);
    await setStatus(db, "invoice", voided.invoice.id, "void");

    await billRent(db, "2026-01-01", today);

    const [again] = await chargesForLease(db, made.id);
    expect(again.periodStart).toBe("2026-01-01");
    expect(again.invoice.id).not.toBe(voided.invoice.id);
    expect(again.invoice.status).toBe("draft");
    expect(await chargeForInvoice(db, voided.invoice.id)).toBeNull();
  });

  it("bills the period the last day cuts short in full, and nothing after it", async () => {
    const made = await lease({ firstDay: "2026-01-01", lastDay: "2026-02-10", rent: 50_000 });

    await billRent(db, "2026-06-30", today);

    const charges = await chargesForLease(db, made.id);
    expect(charges.map(({ periodStart }) => periodStart)).toEqual(["2026-01-01", "2026-02-01"]);
    expect((await getDocument(db, "invoice", charges[1].invoice.id, today))?.total).toBe(50_000);
  });

  it("skips cancelled leases and periods after the date", async () => {
    const cancelled = await lease({ firstDay: "2026-04-01" });
    await cancelLease(db, { id: cancelled.id, today });
    const later = await lease({ firstDay: "2026-03-02" });

    await billRent(db, "2026-04-01", today);

    expect(await charged(cancelled.id)).toEqual([]);
    expect(await charged(later.id)).toEqual([["2026-03-02", "2026-04-01"]]);
  });

  it("leaves invoices already made alone when the lease's rent changes", async () => {
    const made = await lease();
    await billRent(db, "2026-01-01", today);
    await updateLease(db, {
      id: made.id,
      customerId: made.customerId,
      firstDay: made.firstDay,
      rent: 1,
    });

    await billRent(db, "2026-02-01", today);

    const [january, february] = await chargesForLease(db, made.id);
    expect((await getDocument(db, "invoice", january.invoice.id, today))?.total).toBe(100_000);
    expect((await getDocument(db, "invoice", february.invoice.id, today))?.total).toBe(1);
  });

  it("names the lease and period of an invoice it made", async () => {
    const made = await lease();
    await billRent(db, "2026-01-01", today);
    const [charge] = await chargesForLease(db, made.id);

    expect(await chargeForInvoice(db, charge.invoice.id)).toMatchObject({
      leaseId: made.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      unitName: expect.any(String),
    });
  });
});
