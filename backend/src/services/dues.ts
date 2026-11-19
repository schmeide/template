import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { documents } from "../db/schema/documents.ts";
import { periodInvoices } from "../db/schema/dues.ts";
import { membershipPeriods } from "../db/schema/membership.ts";
import { currentDate, insertDocument, reference, type Document } from "./documents.ts";

// The invoice is due this many days after it is made, as in the invoice editor.
const paymentDays = 30;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Why a period was not billed: no such period, it has no fee, or it is already on an invoice
// that is not void.
export type Refusal = "not found" | "no fee" | "billed";

// Makes a draft invoice for the member with one line for the period's dues, at the fee copied onto
// the period, with no tax. The period's row lock makes a second click wait, then find the first
// one's invoice.
export const billPeriod = (
  db: Db,
  periodId: number,
  today = currentDate()
): Promise<Document | Refusal> =>
  db.transaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(membershipPeriods)
      .where(eq(membershipPeriods.id, periodId))
      .for("update");
    if (!period) return "not found";
    if (period.fee === 0) return "no fee";
    const [live] = await tx
      .select({ id: documents.id })
      .from(periodInvoices)
      .innerJoin(documents, eq(periodInvoices.documentId, documents.id))
      .where(and(eq(periodInvoices.periodId, periodId), ne(documents.status, "void")));
    if (live) return "billed";
    const dates =
      period.endsOn === null ? `from ${period.startsOn}` : `${period.startsOn} to ${period.endsOn}`;
    const invoice = await insertDocument(tx, "invoice", {
      customerId: period.customerId,
      issueDate: today,
      dueDate: addDays(today, paymentDays),
      lines: [
        {
          description: `${period.levelName} membership, ${dates}`,
          quantity: 1000,
          unitPrice: period.fee,
          taxRate: 0,
        },
      ],
    });
    await tx.insert(periodInvoices).values({ periodId, documentId: invoice.id });
    return invoice;
  });

// A period's dues: unbilled, or billed or paid on its invoice that is not void, and whether it
// has a fee to bill at all.
export const getForPeriod = async (db: Db, periodId: number) => {
  const [period] = await db
    .select({ fee: membershipPeriods.fee })
    .from(membershipPeriods)
    .where(eq(membershipPeriods.id, periodId));
  const billable = (period?.fee ?? 0) > 0;
  const [row] = await db
    .select({ id: documents.id, number: documents.number, status: documents.status })
    .from(periodInvoices)
    .innerJoin(documents, eq(periodInvoices.documentId, documents.id))
    .where(and(eq(periodInvoices.periodId, periodId), ne(documents.status, "void")));
  if (!row) return { state: "unbilled" as const, invoice: null, billable };
  return {
    state: row.status === "paid" ? ("paid" as const) : ("billed" as const),
    invoice: { id: row.id, reference: reference("invoice", row.number) },
    billable,
  };
};

// The period an invoice bills, or null when it bills none.
export const getForInvoice = async (db: Db, documentId: number) => {
  const [row] = await db
    .select({
      id: membershipPeriods.id,
      customerId: membershipPeriods.customerId,
      levelName: membershipPeriods.levelName,
      startsOn: membershipPeriods.startsOn,
      endsOn: membershipPeriods.endsOn,
    })
    .from(periodInvoices)
    .innerJoin(membershipPeriods, eq(periodInvoices.periodId, membershipPeriods.id))
    .where(eq(periodInvoices.documentId, documentId));
  return row ?? null;
};
