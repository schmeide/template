import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { NewEntry } from "../../db/schema/ledger.ts";
import { billEntries, getBillingAccount, previewBill, setBillingAccount } from "../billing.ts";
import { createCustomer } from "../customers.ts";
import { getDocument, setStatus } from "../documents.ts";
import { addEntry, createAccount, reverseEntry } from "../ledger.ts";

// Tests share one database, so each makes its own accounts and customers.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-04-01";
const march = { from: "2026-03-01", to: "2026-03-31" };

// An account with no floor, billed at 60.00 an hour unless `billed` is false.
const newAccount = async (billed = true) => {
  const account = await createAccount(db, { name: randomUUID(), unit: "min", floor: null });
  const customer = await createCustomer(db, { name: randomUUID() });
  if (billed)
    await setBillingAccount(db, { accountId: account.id, customerId: customer.id, rate: 6000 });
  return { accountId: account.id, customerId: customer.id };
};

const entry = async (
  accountId: number,
  quantity: number,
  entryDate = "2026-03-10",
  kind: NewEntry["kind"] = "in"
) => {
  const added = await addEntry(db, { accountId, kind, quantity, entryDate, note: "Design" });
  if (typeof added !== "object") throw new Error(`The entry was refused: ${added}`);
  return added;
};

const reverse = async (entryId: number, entryDate = "2026-03-20") => {
  const reversal = await reverseEntry(db, { entryId, entryDate });
  if (typeof reversal !== "object") throw new Error(`The reversal was refused: ${reversal}`);
  return reversal;
};

const bill = async (accountId: number, period = march) => {
  const invoice = await billEntries(db, { accountId, ...period }, today);
  if (typeof invoice !== "object") throw new Error(`Billing was refused: ${invoice}`);
  return invoice;
};

const previewedIds = async (accountId: number, period = march) =>
  (await previewBill(db, { accountId, ...period }))?.lines.map((line) => line.entryId);

describe("billing service", () => {
  it("keeps who an account is billed to and its rate, and changes them", async () => {
    const { accountId, customerId } = await newAccount(false);
    expect(await getBillingAccount(db, accountId)).toBeNull();

    await setBillingAccount(db, { accountId, customerId, rate: 6000 });
    await setBillingAccount(db, { accountId, customerId, rate: 7500 });

    expect(await getBillingAccount(db, accountId)).toEqual({ accountId, customerId, rate: 7500 });
  });

  it("previews the unbilled billable entries in the period as hours at the rate", async () => {
    const { accountId } = await newAccount();
    const first = await entry(accountId, 90, "2026-03-01");
    const last = await entry(accountId, 20, "2026-03-31");
    await entry(accountId, 60, "2026-02-28");
    await entry(accountId, 60, "2026-04-01");

    const preview = await previewBill(db, { accountId, ...march });

    expect(preview?.lines).toEqual([
      expect.objectContaining({ entryId: first.id, quantity: 1500, unitPrice: 6000 }),
      expect.objectContaining({ entryId: last.id, quantity: 333, unitPrice: 6000 }),
    ]);
    expect(preview?.total).toBe(9000 + 1998);
  });

  it("bills only billable entries", async () => {
    const { accountId } = await newAccount();
    const billable = await entry(accountId, 30);
    await entry(accountId, -30, "2026-03-10", "out");
    await entry(accountId, 45, "2026-03-10", "adjust");

    expect(await previewedIds(accountId)).toEqual([billable.id]);
  });

  it("makes a draft invoice for the account's customer with one line per entry", async () => {
    const { accountId, customerId } = await newAccount();
    await entry(accountId, 90, "2026-03-02");
    await entry(accountId, 30, "2026-03-03");

    const made = await bill(accountId);

    const invoice = await getDocument(db, "invoice", made.id, today);
    expect(invoice).toMatchObject({
      status: "draft",
      customerId,
      issueDate: today,
      dueDate: "2026-05-01",
      total: 12_000,
    });
    expect(
      invoice?.lines.map(({ description, quantity, unitPrice }) => [
        description,
        quantity,
        unitPrice,
      ])
    ).toEqual([
      ["2026-03-02, Design", 1500, 6000],
      ["2026-03-03, Design", 500, 6000],
    ]);
  });

  it("bills an entry once: billed entries leave the preview and are not billed again", async () => {
    const { accountId } = await newAccount();
    await entry(accountId, 60);
    await bill(accountId);

    expect(await previewedIds(accountId)).toEqual([]);
    expect(await billEntries(db, { accountId, ...march }, today)).toBe("nothing to bill");
  });

  it("makes one invoice when two people bill the same account at once", async () => {
    const { accountId } = await newAccount();
    await entry(accountId, 60);
    await entry(accountId, 30);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => billEntries(db, { accountId, ...march }, today))
    );

    const invoices = results.filter((result) => typeof result === "object");
    expect(invoices).toHaveLength(1);
    expect(results.filter((result) => result === "nothing to bill")).toHaveLength(3);
    expect((await getDocument(db, "invoice", invoices[0].id, today))?.lines).toHaveLength(2);
  });

  it("frees a void invoice's entries to be billed again", async () => {
    const { accountId } = await newAccount();
    const billed = await entry(accountId, 60);
    const first = await bill(accountId);

    await setStatus(db, "invoice", first.id, "void");

    expect(await previewedIds(accountId)).toEqual([billed.id]);
    const second = await bill(accountId);
    expect(second.id).not.toBe(first.id);
    expect((await getDocument(db, "invoice", second.id, today))?.total).toBe(6000);
  });

  it("bills neither an entry nor its reversal while both are unbilled", async () => {
    const { accountId } = await newAccount();
    const kept = await entry(accountId, 30);
    const reversed = await entry(accountId, 60);
    await reverse(reversed.id);

    expect(await previewedIds(accountId)).toEqual([kept.id]);
  });

  it("credits a billed entry's reversal on the next invoice", async () => {
    const { accountId } = await newAccount();
    const billed = await entry(accountId, 60, "2026-03-02");
    await bill(accountId);
    const reversal = await reverse(billed.id, "2026-03-20");
    await entry(accountId, 90, "2026-03-21");

    const made = await bill(accountId);

    const invoice = await getDocument(db, "invoice", made.id, today);
    expect(
      invoice?.lines.map(({ description, quantity, unitPrice }) => [
        description,
        quantity,
        unitPrice,
      ])
    ).toEqual([
      [`2026-03-20, Correction of entry ${billed.id}`, 1000, -6000],
      ["2026-03-21, Design", 1500, 6000],
    ]);
    expect(invoice?.total).toBe(3000);
    expect(await previewedIds(accountId)).not.toContain(reversal.id);
  });

  it("refuses an invoice that credits would take to zero or below, and carries the credit", async () => {
    const { accountId } = await newAccount();
    const billed = await entry(accountId, 60, "2026-03-02");
    await bill(accountId);
    const reversal = await reverse(billed.id, "2026-03-20");

    expect(await billEntries(db, { accountId, ...march }, today)).toBe("nothing to bill");

    await entry(accountId, 30, "2026-04-02");
    expect(await billEntries(db, { accountId, from: "2026-03-01", to: "2026-04-30" }, today)).toBe(
      "nothing to bill"
    );
    await entry(accountId, 90, "2026-04-03");
    const made = await bill(accountId, { from: "2026-03-01", to: "2026-04-30" });
    expect((await getDocument(db, "invoice", made.id, today))?.total).toBe(6000);
    expect(await previewedIds(accountId, { from: "2026-03-01", to: "2026-04-30" })).not.toContain(
      reversal.id
    );
  });

  it("refuses to bill an account with no customer and rate", async () => {
    const { accountId } = await newAccount(false);
    await entry(accountId, 60);

    expect(await previewBill(db, { accountId, ...march })).toBeUndefined();
    expect(await billEntries(db, { accountId, ...march }, today)).toBe("no billing");
  });
});
