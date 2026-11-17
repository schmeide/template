import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { ledgerEntries, type NewEntry } from "../../db/schema/ledger.ts";
import {
  addEntry,
  createAccount,
  entriesCsv,
  getAccount,
  listBalances,
  periodSummary,
  reverseEntry,
  updateAccount,
} from "../ledger.ts";

// Tests share one database, so each makes its own accounts and asserts only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newAccount = (floor: number | null = 0, lowAt: number | null = null) =>
  createAccount(db, { name: randomUUID(), unit: "pcs", floor, lowAt });

const entry = async (
  accountId: number,
  kind: NewEntry["kind"],
  quantity: number,
  entryDate = "2026-03-10"
) => {
  const added = await addEntry(db, { accountId, kind, quantity, entryDate });
  if (typeof added !== "object") throw new Error(`The entry was refused: ${added}`);
  return added;
};

const balanceOf = async (id: number) => (await getAccount(db, id))?.balance;

describe("ledger service", () => {
  it("computes the balance from the entries", async () => {
    const account = await newAccount();
    await entry(account.id, "in", 10);
    await entry(account.id, "out", -3);
    await entry(account.id, "adjust", -2);

    expect(await balanceOf(account.id)).toBe(5);
    const listed = (await listBalances(db)).find((row) => row.id === account.id);
    expect(listed).toMatchObject({ name: account.name, unit: "pcs", balance: 5 });
  });

  it("starts an account at zero with a floor of zero", async () => {
    const account = await createAccount(db, { name: randomUUID() });

    expect(account).toMatchObject({ unit: "", floor: 0, lowAt: null });
    expect(await balanceOf(account.id)).toBe(0);
  });

  it("marks an account low at or below its threshold", async () => {
    const at = await newAccount(0, 5);
    const above = await newAccount(0, 5);
    const never = await newAccount(0, null);
    await entry(at.id, "in", 5);
    await entry(above.id, "in", 6);

    const balances = await listBalances(db);
    const low = (id: number) => balances.find((row) => row.id === id)?.low;
    expect([low(at.id), low(above.id), low(never.id)]).toEqual([true, false, false]);
  });

  it("refuses an entry that takes the balance below the floor", async () => {
    const account = await newAccount(0);
    await entry(account.id, "in", 2);

    expect(
      await addEntry(db, {
        accountId: account.id,
        kind: "out",
        quantity: -3,
        entryDate: "2026-03-10",
      })
    ).toBe("below floor");
    expect(await balanceOf(account.id)).toBe(2);
  });

  it("lets an account with no floor go negative", async () => {
    const account = await newAccount(null);

    await entry(account.id, "out", -4);

    expect(await balanceOf(account.id)).toBe(-4);
  });

  it("allows an entry that raises a balance already below a raised floor", async () => {
    const account = await newAccount(0);
    await entry(account.id, "in", 1);
    await updateAccount(db, { id: account.id, name: account.name, floor: 5 });

    await entry(account.id, "in", 2);

    expect(await balanceOf(account.id)).toBe(3);
  });

  it("lets only the withdrawals that fit through when they run at once", async () => {
    const account = await newAccount(0);
    await entry(account.id, "in", 3);
    // Open the connections first, so the withdrawals overlap instead of waiting for a connection.
    await Promise.all(Array.from({ length: 8 }, () => db.execute(sql`select 1`)));

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        addEntry(db, { accountId: account.id, kind: "out", quantity: -1, entryDate: "2026-03-10" })
      )
    );

    expect(results.filter((result) => typeof result === "object")).toHaveLength(3);
    expect(results.filter((result) => result === "below floor")).toHaveLength(5);
    expect(await balanceOf(account.id)).toBe(0);
  });

  it("reverses an entry once with the opposite quantity", async () => {
    const account = await newAccount(0);
    const received = await entry(account.id, "in", 4);

    const reversal = await reverseEntry(db, {
      entryId: received.id,
      entryDate: "2026-03-11",
      who: "Sam",
      note: "Wrong item",
    });

    expect(reversal).toMatchObject({
      accountId: account.id,
      kind: "in",
      quantity: -4,
      reverses: received.id,
      who: "Sam",
    });
    expect(await balanceOf(account.id)).toBe(0);
    const again = { entryId: received.id, entryDate: "2026-03-11" };
    expect(await reverseEntry(db, again)).toBe("not reversible");
    const history = (await getAccount(db, account.id))?.entries;
    expect(history?.find((row) => row.id === received.id)?.reversedBy).toBe(
      typeof reversal === "object" ? reversal.id : undefined
    );
  });

  it("does not reverse a reversal", async () => {
    const account = await newAccount(null);
    const received = await entry(account.id, "in", 4);
    const reversal = await reverseEntry(db, { entryId: received.id, entryDate: "2026-03-11" });
    if (typeof reversal !== "object") throw new Error("The reversal was refused");

    expect(await reverseEntry(db, { entryId: reversal.id, entryDate: "2026-03-11" })).toBe(
      "not reversible"
    );
  });

  it("refuses a reversal that takes the balance below the floor", async () => {
    const account = await newAccount(0);
    const received = await entry(account.id, "in", 5);
    const used = await entry(account.id, "out", -4);

    expect(await reverseEntry(db, { entryId: received.id, entryDate: "2026-03-11" })).toBe(
      "below floor"
    );
    expect(await reverseEntry(db, { entryId: used.id, entryDate: "2026-03-11" })).toMatchObject({
      quantity: 4,
    });
    expect(await balanceOf(account.id)).toBe(5);
  });

  it("holds the reverse-once rule and the signs in the database too", async () => {
    const account = await newAccount(null);
    const received = await entry(account.id, "in", 4);
    const reversal = {
      accountId: account.id,
      kind: "in" as const,
      quantity: -4,
      entryDate: "2026-03-11",
      reverses: received.id,
    };
    await db.insert(ledgerEntries).values(reversal);

    await expect(db.insert(ledgerEntries).values(reversal)).rejects.toThrow();
    await expect(
      db.insert(ledgerEntries).values({ ...reversal, reverses: null, kind: "out", quantity: 1 })
    ).rejects.toThrow();
    await expect(
      db.insert(ledgerEntries).values({ ...reversal, reverses: null, quantity: 0, kind: "adjust" })
    ).rejects.toThrow();
  });

  it("returns nothing for a missing account or entry", async () => {
    expect(
      await addEntry(db, { accountId: -1, kind: "in", quantity: 1, entryDate: "2026-03-10" })
    ).toBeUndefined();
    expect(await reverseEntry(db, { entryId: -1, entryDate: "2026-03-10" })).toBeUndefined();
    expect(await getAccount(db, -1)).toBeUndefined();
    expect(await updateAccount(db, { id: -1, name: "x" })).toBeUndefined();
  });

  it("lists an account's entries newest first", async () => {
    const account = await newAccount();
    await entry(account.id, "in", 1, "2026-03-02");
    await entry(account.id, "in", 2, "2026-03-03");
    await entry(account.id, "in", 3, "2026-03-02");

    const history = (await getAccount(db, account.id))?.entries.map((row) => row.quantity);

    expect(history).toEqual([2, 3, 1]);
  });

  it("updates an account's name, unit, floor and threshold", async () => {
    const account = await newAccount();

    const updated = await updateAccount(db, {
      id: account.id,
      name: "Bolts",
      unit: "boxes",
      floor: null,
      lowAt: 10,
    });

    expect(updated).toMatchObject({ name: "Bolts", unit: "boxes", floor: null, lowAt: 10 });
  });

  it("sums a period by account and kind, including both end days", async () => {
    const account = await newAccount(null);
    await entry(account.id, "in", 1, "2026-02-28");
    await entry(account.id, "in", 10, "2026-03-01");
    await entry(account.id, "in", 20, "2026-03-31");
    await entry(account.id, "out", -4, "2026-03-15");
    await entry(account.id, "adjust", 100, "2026-04-01");

    const rows = (await periodSummary(db, { from: "2026-03-01", to: "2026-03-31" })).filter(
      (row) => row.accountId === account.id
    );

    expect(rows).toEqual([
      {
        accountId: account.id,
        name: account.name,
        unit: "pcs",
        kind: "in",
        quantity: 30,
        entries: 2,
      },
      {
        accountId: account.id,
        name: account.name,
        unit: "pcs",
        kind: "out",
        quantity: -4,
        entries: 1,
      },
    ]);
  });

  it("exports a period's entries as CSV", async () => {
    const account = await newAccount(null);
    await addEntry(db, {
      accountId: account.id,
      kind: "in",
      quantity: 7,
      entryDate: "2026-05-01",
      who: "Ana",
      note: '=1+1, "urgent"',
      reference: "PO-1",
    });
    await entry(account.id, "in", 1, "2026-05-02");

    const csv = await entriesCsv(db, { from: "2026-05-01", to: "2026-05-01" });
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Entry,Date,Account,Unit,Kind,Quantity,Who,Reference,Note,Reverses");
    const mine = lines.filter((line) => line.includes(account.name));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(
      new RegExp(`^\\d+,2026-05-01,${account.name},pcs,in,7,Ana,PO-1,"'=1\\+1, ""urgent""",$`)
    );
  });
});
