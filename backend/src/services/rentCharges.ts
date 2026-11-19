import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { documents } from "../db/schema/documents.ts";
import { leases, type Lease } from "../db/schema/leases.ts";
import { registryRecords } from "../db/schema/registry.ts";
import { rentCharges } from "../db/schema/rentCharges.ts";
import { currentDate, insertDocument, reference, type Document } from "./documents.ts";

type Terms = Pick<Lease, "firstDay" | "lastDay" | "rentPeriod">;
export type Period = { readonly start: string; readonly end: string };

const dayMs = 86_400_000;
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, days: number) => toDay(Date.parse(`${day}T00:00:00Z`) + days * dayMs);

// The same day of the month `months` after `day`, or the month's last day when it is shorter.
const addMonths = (day: string, months: number) => {
  const [year, month, date] = day.split("-").map(Number);
  const lastOfMonth = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return toDay(Date.UTC(year, month - 1 + months, Math.min(date, lastOfMonth)));
};

// The nth period's first day, always counted from the lease's first day.
const periodStart = ({ firstDay, rentPeriod }: Terms, n: number) =>
  rentPeriod === "weekly" ? addDays(firstDay, 7 * n) : addMonths(firstDay, n);

// The periods that start on or before `upTo` and on or before the last day. A period the last
// day cuts short keeps its full length.
export const rentPeriods = (terms: Readonly<Terms>, upTo: string): readonly Period[] => {
  const periods: Period[] = [];
  for (let n = 0; ; n++) {
    const start = periodStart(terms, n);
    if (start > upTo || (terms.lastDay !== null && start > terms.lastDay)) return periods;
    periods.push({ start, end: addDays(periodStart(terms, n + 1), -1) });
  }
};

// The last day of the period that starts on `start`, whatever the lease's last day is now.
const periodEnd = (terms: Readonly<Terms>, start: string) =>
  rentPeriods({ ...terms, lastDay: null }, start).at(-1)?.end ?? start;

// For every lease that is not cancelled, makes a draft invoice for each period that starts on or
// before `upTo` and has no charge on an invoice that is not void. Each lease is billed in its own
// transaction, which locks the lease's row before reading its charges, so two runs at once queue
// per lease and the second finds the periods billed. Returns the invoices made.
export const billRent = async (
  db: Db,
  upTo: string,
  today = currentDate()
): Promise<readonly Document[]> => {
  const due = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(isNull(leases.cancelledAt), lte(leases.firstDay, upTo)))
    .orderBy(asc(leases.id));
  const made: Document[] = [];
  for (const { id } of due) {
    made.push(
      ...(await db.transaction(async (tx) => {
        const [lease] = await tx
          .select()
          .from(leases)
          .where(and(eq(leases.id, id), isNull(leases.cancelledAt)))
          .for("update");
        if (!lease) return [];
        const charges = await tx
          .select({ periodStart: rentCharges.periodStart, status: documents.status })
          .from(rentCharges)
          .innerJoin(documents, eq(rentCharges.documentId, documents.id))
          .where(eq(rentCharges.leaseId, id));
        const status = new Map(charges.map((charge) => [charge.periodStart, charge.status]));
        const invoices: Document[] = [];
        for (const { start, end } of rentPeriods(lease, upTo)) {
          if (status.has(start) && status.get(start) !== "void") continue;
          const invoice = await insertDocument(tx, "invoice", {
            customerId: lease.customerId,
            // Billed ahead it is issued today; billed late, on the day it fell due.
            issueDate: start < today ? start : today,
            dueDate: start,
            lines: [
              {
                description: `Rent ${start} to ${end}`,
                quantity: 1000,
                unitPrice: lease.rent,
                taxRate: 0,
              },
            ],
          });
          await tx
            .insert(rentCharges)
            .values({ leaseId: id, periodStart: start, documentId: invoice.id })
            .onConflictDoUpdate({
              target: [rentCharges.leaseId, rentCharges.periodStart],
              set: { documentId: invoice.id },
            });
          invoices.push(invoice);
        }
        return invoices;
      }))
    );
  }
  return made;
};

// A lease's charges by period, each with its invoice's number and status.
export const chargesForLease = async (db: Db, leaseId: number) => {
  const rows = await db
    .select({
      periodStart: rentCharges.periodStart,
      invoice: { id: documents.id, number: documents.number, status: documents.status },
      lease: { firstDay: leases.firstDay, lastDay: leases.lastDay, rentPeriod: leases.rentPeriod },
    })
    .from(rentCharges)
    .innerJoin(documents, eq(rentCharges.documentId, documents.id))
    .innerJoin(leases, eq(rentCharges.leaseId, leases.id))
    .where(eq(rentCharges.leaseId, leaseId))
    .orderBy(asc(rentCharges.periodStart));
  return rows.map(({ periodStart, invoice, lease }) => ({
    periodStart,
    periodEnd: periodEnd(lease, periodStart),
    invoice: {
      id: invoice.id,
      reference: reference("invoice", invoice.number),
      status: invoice.status,
    },
  }));
};

// The lease and period an invoice bills, or null when it was not made from a lease (or a later
// invoice has replaced it after it was voided).
export const chargeForInvoice = async (db: Db, documentId: number) => {
  const [row] = await db
    .select({
      leaseId: rentCharges.leaseId,
      periodStart: rentCharges.periodStart,
      unitName: registryRecords.name,
      lease: { firstDay: leases.firstDay, lastDay: leases.lastDay, rentPeriod: leases.rentPeriod },
    })
    .from(rentCharges)
    .innerJoin(leases, eq(rentCharges.leaseId, leases.id))
    .innerJoin(registryRecords, eq(leases.recordId, registryRecords.id))
    .where(eq(rentCharges.documentId, documentId));
  if (!row) return null;
  const { lease, ...charge } = row;
  return { ...charge, periodEnd: periodEnd(lease, charge.periodStart) };
};
