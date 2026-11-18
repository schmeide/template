import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { createCustomer } from "../customers.ts";
import { getDocument, setStatus } from "../documents.ts";
import { billPeriod, getForInvoice, getForPeriod } from "../dues.ts";
import { addPeriod, createLevel, getMember } from "../membership.ts";

// Tests share one database, so each makes its own customers, levels and periods.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2030-04-01";

// A new member's first period, from 2030-03-15, at a new level.
const newPeriod = async (fee = 5000, months: number | null = 12) => {
  const level = await createLevel(db, { name: randomUUID(), fee, months });
  const customer = await createCustomer(db, { name: randomUUID() });
  const period = await addPeriod(
    db,
    { customerId: customer.id, levelId: level.id, latestPeriodId: null },
    "2030-03-15"
  );
  if (typeof period === "string") throw new Error(period);
  return period;
};

const bill = async (periodId: number) => {
  const invoice = await billPeriod(db, periodId, today);
  if (typeof invoice === "string") throw new Error(`Billing was refused: ${invoice}`);
  return invoice;
};

describe("dues service", () => {
  it("bills a period as a draft invoice for the member, at the fee copied onto the period", async () => {
    const period = await newPeriod(5000);

    const invoice = await bill(period.id);

    expect(invoice).toMatchObject({
      customerId: period.customerId,
      status: "draft",
      issueDate: today,
      dueDate: "2030-05-01",
    });
    expect((await getDocument(db, "invoice", invoice.id))?.lines).toMatchObject([
      {
        description: `${period.levelName} membership, 2030-03-15 to 2031-03-14`,
        quantity: 1000,
        unitPrice: 5000,
        taxRate: 0,
        amount: 5000,
      },
    ]);
    expect(await getForPeriod(db, period.id)).toMatchObject({
      state: "billed",
      invoice: { id: invoice.id },
    });
    expect(await getForInvoice(db, invoice.id)).toMatchObject({
      id: period.id,
      customerId: period.customerId,
      startsOn: "2030-03-15",
    });
  });

  it("bills a life membership with a fee once, and never a period with no fee", async () => {
    const life = await newPeriod(30000, null);
    const honorary = await newPeriod(0, null);

    const invoice = await bill(life.id);

    expect((await getDocument(db, "invoice", invoice.id))?.lines[0].description).toBe(
      `${life.levelName} membership, from 2030-03-15`
    );
    expect(await billPeriod(db, honorary.id, today)).toBe("no fee");
    expect(await getForPeriod(db, honorary.id)).toEqual({
      state: "unbilled",
      invoice: null,
      billable: false,
    });
    expect(await billPeriod(db, -1, today)).toBe("not found");
  });

  it("makes one invoice when two people bill a period at once", async () => {
    const period = await newPeriod();

    const results = await Promise.all(
      Array.from({ length: 4 }, () => billPeriod(db, period.id, today))
    );

    expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
    expect(results.filter((result) => result === "billed")).toHaveLength(3);
  });

  it("frees a period whose invoice is void, and leaves membership alone once it is paid", async () => {
    const period = await newPeriod();
    const first = await bill(period.id);
    expect(await billPeriod(db, period.id, today)).toBe("billed");

    await setStatus(db, "invoice", first.id, "void");
    expect(await getForPeriod(db, period.id)).toEqual({
      state: "unbilled",
      invoice: null,
      billable: true,
    });
    const second = await bill(period.id);
    // The void invoice still says which period it was for.
    expect(await getForInvoice(db, first.id)).toMatchObject({ id: period.id });

    await setStatus(db, "invoice", second.id, "sent");
    await setStatus(db, "invoice", second.id, "paid");
    expect(await getForPeriod(db, period.id)).toMatchObject({
      state: "paid",
      invoice: { id: second.id },
    });
    expect(await billPeriod(db, period.id, today)).toBe("billed");
    // Status still comes from the dates.
    expect(await getMember(db, period.customerId, "2031-04-01")).toMatchObject({
      status: "lapsed",
    });
  });
});
