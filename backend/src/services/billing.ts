import { and, asc, eq, inArray, ne, notExists } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  billedEntries,
  billingAccounts,
  type BillingAccount,
  type BillingAccountInput,
  type BillingPeriod,
} from "../db/schema/billing.ts";
import { documents } from "../db/schema/documents.ts";
import { ledgerEntries, type Entry } from "../db/schema/ledger.ts";
import { currentDate, insertDocument, type Document, type Tx } from "./documents.ts";
import { lineAmounts, totals } from "./money.ts";

// The entry kinds that are billed. Time tracking renames this kind to "billable".
const billableKinds: readonly Entry["kind"][] = ["in"];

// The invoice is due this many days after it is made, as in the invoice editor.
const paymentDays = 30;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Entries are minutes; an invoice line's quantity is hours in thousandths.
const toThousandths = (minutes: number) => Math.round((Math.abs(minutes) * 1000) / 60);

// What billing can be refused for.
export type Refusal = "no billing" | "nothing to bill";

export const setBillingAccount = async (
  db: Db,
  input: Readonly<BillingAccountInput>
): Promise<BillingAccount> => {
  const [row] = await db
    .insert(billingAccounts)
    .values(input)
    .onConflictDoUpdate({
      target: billingAccounts.accountId,
      set: { customerId: input.customerId, rate: input.rate },
    })
    .returning();
  return row;
};

export const getBillingAccount = async (
  db: Db | Tx,
  accountId: number
): Promise<BillingAccount | null> => {
  const [row] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.accountId, accountId));
  return row ?? null;
};

// The outer query's entry, if it is on an invoice that is not void.
const onLiveInvoice = (tx: Db | Tx) =>
  tx
    .select({ entryId: billedEntries.entryId })
    .from(billedEntries)
    .innerJoin(documents, eq(documents.id, billedEntries.documentId))
    .where(and(eq(billedEntries.entryId, ledgerEntries.id), ne(documents.status, "void")));

// One invoice line per unbilled billable entry dated in the period, oldest first. An entry and
// its reversal that are both unbilled cancel out and neither is listed. The reversal of a billed
// entry is listed as a credit: a positive quantity at a negative unit price.
const pendingLines = async (
  tx: Db | Tx,
  { accountId, rate }: Readonly<BillingAccount>,
  { from, to }: Readonly<Omit<BillingPeriod, "accountId">>
) => {
  const rows = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.accountId, accountId),
        inArray(ledgerEntries.kind, [...billableKinds]),
        notExists(onLiveInvoice(tx))
      )
    )
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
  const unbilled = new Set(rows.map((row) => row.id));
  const reversedWhileUnbilled = new Set(rows.map((row) => row.reverses));
  return rows
    .filter(
      (row) =>
        row.entryDate >= from &&
        row.entryDate <= to &&
        !reversedWhileUnbilled.has(row.id) &&
        !(row.reverses !== null && unbilled.has(row.reverses))
    )
    .map((row) => ({
      entryId: row.id,
      entryDate: row.entryDate,
      description: [
        row.entryDate,
        row.reverses === null ? "" : `Correction of entry ${row.reverses}`,
        row.who,
        row.note,
      ]
        .filter((part) => part !== "")
        .join(", ")
        .slice(0, 500),
      quantity: toThousandths(row.quantity),
      unitPrice: row.quantity < 0 ? -rate : rate,
      taxRate: 0,
    }));
};

// What billing the period would put on an invoice, or undefined when the account has no billing.
export const previewBill = async (db: Db, { accountId, ...period }: Readonly<BillingPeriod>) => {
  const billing = await getBillingAccount(db, accountId);
  if (!billing) return undefined;
  const lines = await pendingLines(db, billing, period);
  return {
    lines: lines.map((line) => ({ ...line, amount: lineAmounts(line).net })),
    total: totals(lines).total,
  };
};

// Makes a draft invoice for the account's customer from the unbilled entries in the period, and
// records which entries it holds. Credits must leave the invoice above zero; until they do,
// billing is refused and the credits wait for more entries.
export const billEntries = (
  db: Db,
  { accountId, ...period }: Readonly<BillingPeriod>,
  today = currentDate()
): Promise<Document | Refusal> =>
  db.transaction(async (tx) => {
    // The row lock makes a second billing of the account wait, then find these entries billed.
    const [billing] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.accountId, accountId))
      .for("update");
    if (!billing) return "no billing";
    const lines = await pendingLines(tx, billing, period);
    if (lines.length === 0 || totals(lines).total <= 0) return "nothing to bill";
    const invoice = await insertDocument(tx, "invoice", {
      customerId: billing.customerId,
      issueDate: today,
      dueDate: addDays(today, paymentDays),
      lines: lines.map(({ description, quantity, unitPrice, taxRate }) => ({
        description,
        quantity,
        unitPrice,
        taxRate,
      })),
    });
    await tx
      .insert(billedEntries)
      .values(lines.map(({ entryId }) => ({ entryId, documentId: invoice.id })));
    return invoice;
  });
