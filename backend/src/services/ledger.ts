import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client.ts";
import {
  ledgerAccounts,
  ledgerEntries,
  type Account,
  type AccountUpdate,
  type Entry,
  type NewAccount,
  type NewEntry,
  type Period,
  type Reversal,
} from "../db/schema/ledger.ts";
import { toCsv } from "./csv.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What an entry can be refused for, besides a missing row (undefined).
export type Refusal = "below floor" | "not reversible";

// Postgres sums integers as bigint, which arrives as a string.
const total = sql<number>`coalesce(sum(${ledgerEntries.quantity}), 0)`.mapWith(Number);

const balanceOf = async (tx: Tx, accountId: number) => {
  const [{ balance }] = await tx
    .select({ balance: total })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));
  return balance;
};

export const createAccount = async (db: Db | Tx, input: Readonly<NewAccount>): Promise<Account> => {
  const [account] = await db.insert(ledgerAccounts).values(input).returning();
  return account;
};

export const updateAccount = async (
  db: Db,
  { id, ...input }: Readonly<AccountUpdate>
): Promise<Account | undefined> => {
  const [account] = await db
    .update(ledgerAccounts)
    .set({
      name: input.name,
      unit: input.unit ?? "",
      floor: input.floor ?? null,
      lowAt: input.lowAt ?? null,
    })
    .where(eq(ledgerAccounts.id, id))
    .returning();
  return account;
};

// Inserts an entry while holding its account row locked, so two writers to one account queue and
// each checks the floor against a balance that includes the other's entry. A decrease that would
// take the balance below the floor is refused; an increase is always allowed. Inside another
// transaction it runs as a savepoint of it.
const append = (
  db: Db | Tx,
  accountId: number,
  build: (
    tx: Tx
  ) => Promise<(Omit<NewEntry, "accountId"> & { readonly reverses?: number }) | Refusal>
): Promise<Entry | Refusal | undefined> =>
  db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId))
      .for("update");
    if (!account) return undefined;
    const values = await build(tx);
    if (typeof values === "string") return values;
    if (values.quantity < 0 && account.floor !== null) {
      const balance = await balanceOf(tx, accountId);
      if (balance + values.quantity < account.floor) return "below floor";
    }
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({ ...values, accountId })
      .returning();
    return entry;
  });

export const addEntry = (db: Db | Tx, { accountId, ...input }: Readonly<NewEntry>) =>
  append(db, accountId, () => Promise.resolve(input));

const findEntry = async (tx: Tx | Db, id: number) => {
  const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, id));
  return entry;
};

// Records the opposite of an entry, in its kind, so the period summary nets it out. An entry is
// reversed at most once, and a reversal is not reversed: record a new entry instead.
export const reverseEntry = async (
  db: Db,
  { entryId, ...input }: Readonly<Reversal>
): Promise<Entry | Refusal | undefined> => {
  const original = await findEntry(db, entryId);
  if (!original) return undefined;
  return append(db, original.accountId, async (tx) => {
    const [reversed] = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.reverses, entryId));
    if (reversed || original.reverses !== null) return "not reversible";
    return { ...input, kind: original.kind, quantity: -original.quantity, reverses: entryId };
  });
};

// Every account with its balance, by name.
// ponytail: sums every entry on each read; add a periodic closing balance when an account's
// history reaches hundreds of thousands of entries.
export const listBalances = async (db: Db) => {
  const rows = await db
    .select({ account: ledgerAccounts, balance: total })
    .from(ledgerAccounts)
    .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .groupBy(ledgerAccounts.id)
    .orderBy(asc(ledgerAccounts.name), asc(ledgerAccounts.id));
  return rows.map(({ account, balance }) => ({
    ...account,
    balance,
    low: account.lowAt !== null && balance <= account.lowAt,
  }));
};

const reversal = alias(ledgerEntries, "reversal");

// An account, its balance, and its entries newest first, each with the id of its reversal.
// ponytail: loads the whole history with no paging; page it when accounts reach thousands.
export const getAccount = async (db: Db, id: number) => {
  const [account] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, id));
  if (!account) return undefined;
  const entries = await db
    .select({ entry: ledgerEntries, reversedBy: reversal.id })
    .from(ledgerEntries)
    .leftJoin(reversal, eq(reversal.reverses, ledgerEntries.id))
    .where(eq(ledgerEntries.accountId, id))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.id));
  return {
    ...account,
    balance: entries.reduce((sum, { entry }) => sum + entry.quantity, 0),
    entries: entries.map(({ entry, reversedBy }) => ({ ...entry, reversedBy })),
  };
};

const inPeriod = ({ from, to }: Readonly<Period>) =>
  and(gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to));

// The net quantity and entry count per account and kind for entries dated from `from` to `to`,
// both days included.
export const periodSummary = (db: Db, period: Readonly<Period>) =>
  db
    .select({
      accountId: ledgerAccounts.id,
      name: ledgerAccounts.name,
      unit: ledgerAccounts.unit,
      kind: ledgerEntries.kind,
      quantity: total,
      entries: sql<number>`count(*)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .where(inPeriod(period))
    .groupBy(ledgerAccounts.id, ledgerEntries.kind)
    .orderBy(asc(ledgerAccounts.name), asc(ledgerAccounts.id), asc(ledgerEntries.kind));

// Every entry dated in the period, oldest first, as CSV with a header row.
export const entriesCsv = async (db: Db, period: Readonly<Period>): Promise<string> => {
  const rows = await db
    .select({ entry: ledgerEntries, account: ledgerAccounts.name, unit: ledgerAccounts.unit })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .where(inPeriod(period))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
  return toCsv([
    [
      "Entry",
      "Date",
      "Account",
      "Unit",
      "Kind",
      "Quantity",
      "Who",
      "Reference",
      "Note",
      "Reverses",
    ],
    ...rows.map(({ entry, account, unit }) => [
      entry.id,
      entry.entryDate,
      account,
      unit,
      entry.kind,
      entry.quantity,
      entry.who,
      entry.reference,
      entry.note,
      entry.reverses,
    ]),
  ]);
};
