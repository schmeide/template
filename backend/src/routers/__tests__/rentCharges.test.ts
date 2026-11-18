import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("rent charges router", () => {
  it("bills rent and reports the charge from the lease and from the invoice", async () => {
    const unit = await caller.assets.create({ name: randomUUID() });
    const tenant = await caller.customers.create({ name: randomUUID() });
    const lease = await caller.leases.create({
      recordId: unit.id,
      customerId: tenant.id,
      firstDay: "2026-01-01",
      lastDay: "2026-01-31",
      rent: 80_000,
    });

    // Other tests' runs bill every lease too and may bill this one first, so read the charge back
    // rather than expecting it in this run's result.
    const made = await caller.rentCharges.bill({ upTo: "2026-01-01" });

    const [charge] = await caller.rentCharges.forLease({ id: lease.id });
    expect(made.every(({ reference }) => reference.startsWith("INV-"))).toBe(true);
    expect(charge).toMatchObject({ periodStart: "2026-01-01", invoice: { status: "draft" } });
    expect(await caller.rentCharges.forInvoice({ id: charge.invoice.id })).toMatchObject({
      leaseId: lease.id,
      unitName: unit.name,
    });
  });

  it("refuses a date that is not a calendar day", async () => {
    await expect(caller.rentCharges.bill({ upTo: "next month" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });
});
