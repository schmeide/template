import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema/customers.ts";
import {
  documentCounters,
  documentLines,
  documents,
  documentStatus,
  payments,
  type DocumentInput,
  type DocumentStatus,
  type DocumentType,
  type DocumentUpdate,
  type Line,
  type NewPayment,
  type Payment,
} from "../db/schema/documents.ts";
import { lineAmounts, totals } from "./money.ts";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Document = typeof documents.$inferSelect;
// Overdue (an invoice) and expired (a quote) are derived from the due date, never stored.
export type DisplayStatus = DocumentStatus | "overdue" | "expired";
export type DocumentFilter = { readonly status?: DisplayStatus; readonly search?: string };

const prefixes: Readonly<Record<DocumentType, string>> = { invoice: "INV", quote: "Q" };

const transitions: Readonly<
  Record<DocumentType, Partial<Record<DocumentStatus, readonly DocumentStatus[]>>>
> = {
  invoice: { draft: ["sent", "void"], sent: ["paid", "void"] },
  quote: { draft: ["sent", "void"], sent: ["accepted", "declined", "void"] },
};

// ponytail: "today" is the UTC date; take the business's time zone once a setting exists for it.
export const currentDate = (): string => new Date().toISOString().slice(0, 10);

export const reference = (type: DocumentType, number: number) =>
  `${prefixes[type]}-${String(number).padStart(4, "0")}`;

const displayStatus = (
  type: DocumentType,
  status: DocumentStatus,
  dueDate: string,
  today: string
): DisplayStatus => {
  if (status !== "sent" || dueDate >= today) return status;
  return type === "quote" ? "expired" : "overdue";
};

const insertLines = async (tx: Tx, documentId: number, lines: readonly Line[]) => {
  if (lines.length === 0) return;
  await tx
    .insert(documentLines)
    .values(lines.map((line, position) => ({ ...line, documentId, position })));
};

const paidByDocument = async (db: Db | Tx, ids: readonly number[]) => {
  if (ids.length === 0) return new Map<number, number>();
  const rows = await db
    .select({ documentId: payments.documentId, paid: sql<number>`sum(${payments.amount})::int` })
    .from(payments)
    .where(inArray(payments.documentId, [...ids]))
    .groupBy(payments.documentId);
  return new Map(rows.map((row) => [row.documentId, row.paid]));
};

// Creates a document inside a transaction the caller holds, for a link that writes more with it.
export const insertDocument = async (
  tx: Tx,
  type: DocumentType,
  { lines, ...fields }: Readonly<DocumentInput>
): Promise<Document> => {
  // The upsert locks the counter row until commit, so concurrent creates queue for the next number.
  const [{ lastNumber }] = await tx
    .insert(documentCounters)
    .values({ type, lastNumber: 1 })
    .onConflictDoUpdate({
      target: documentCounters.type,
      set: { lastNumber: sql`${documentCounters.lastNumber} + 1` },
    })
    .returning();
  const [document] = await tx
    .insert(documents)
    .values({ ...fields, type, number: lastNumber })
    .returning();
  await insertLines(tx, document.id, lines);
  return document;
};

export const createDocument = (
  db: Db,
  type: DocumentType,
  input: Readonly<DocumentInput>
): Promise<Document> => db.transaction((tx) => insertDocument(tx, type, input));

// Only drafts can be edited. Returns undefined when the document is missing or not a draft.
export const updateDocument = (
  db: Db,
  type: DocumentType,
  { id, lines, ...fields }: Readonly<DocumentUpdate>
): Promise<Document | undefined> =>
  db.transaction(async (tx) => {
    const [document] = await tx
      .update(documents)
      .set(fields)
      .where(and(eq(documents.id, id), eq(documents.type, type), eq(documents.status, "draft")))
      .returning();
    if (!document) return undefined;
    await tx.delete(documentLines).where(eq(documentLines.documentId, id));
    await insertLines(tx, id, lines);
    return document;
  });

// Returns undefined when the document is missing or cannot move to `to` from where it is.
export const setStatus = async (
  db: Db,
  type: DocumentType,
  id: number,
  to: DocumentStatus
): Promise<Document | undefined> => {
  const from = documentStatus.enumValues.filter((status) =>
    transitions[type][status]?.includes(to)
  );
  if (from.length === 0) return undefined;
  const [document] = await db
    .update(documents)
    .set({ status: to })
    .where(and(eq(documents.id, id), eq(documents.type, type), inArray(documents.status, from)))
    .returning();
  return document;
};

// Records a payment on a sent invoice, up to its balance, and marks it paid once covered.
export const recordPayment = (db: Db, input: Readonly<NewPayment>): Promise<Payment | undefined> =>
  db.transaction(async (tx) => {
    const [document] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.type, "invoice"),
          eq(documents.status, "sent")
        )
      )
      .for("update");
    if (!document) return undefined;
    const lines = await tx
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, document.id));
    const { total } = totals(lines);
    const paid = (await paidByDocument(tx, [document.id])).get(document.id) ?? 0;
    if (input.amount > total - paid) return undefined;
    const [payment] = await tx.insert(payments).values(input).returning();
    if (paid + input.amount === total) {
      await tx.update(documents).set({ status: "paid" }).where(eq(documents.id, document.id));
    }
    return payment;
  });

const details = async (db: Db, where: SQL | undefined, today: string) => {
  const [row] = await db
    .select({ document: documents, customer: customers })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .where(where);
  if (!row) return undefined;
  const { document, customer } = row;
  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, document.id))
    .orderBy(asc(documentLines.position));
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.documentId, document.id))
    .orderBy(asc(payments.paidOn), asc(payments.id));
  const sums = totals(lines);
  const paid = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    ...document,
    status: displayStatus(document.type, document.status, document.dueDate, today),
    reference: reference(document.type, document.number),
    customer,
    lines: lines.map((line) => ({ ...line, amount: lineAmounts(line).net })),
    payments: paymentRows,
    ...sums,
    paid,
    balance: sums.total - paid,
  };
};

export const getDocument = (db: Db, type: DocumentType, id: number, today = currentDate()) =>
  details(db, and(eq(documents.id, id), eq(documents.type, type)), today);

// The public view: only sent documents, and nothing that identifies rows or other links.
export const getSharedDocument = async (
  db: Db,
  type: DocumentType,
  token: string,
  today = currentDate()
) => {
  const document = await details(
    db,
    and(eq(documents.shareToken, token), eq(documents.type, type), ne(documents.status, "draft")),
    today
  );
  if (!document) return undefined;
  const { name, email, phone, address } = document.customer;
  return {
    reference: document.reference,
    status: document.status,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    notes: document.notes,
    currency: document.currency,
    customer: { name, email, phone, address },
    lines: document.lines.map(({ description, quantity, unitPrice, taxRate, amount }) => ({
      description,
      quantity,
      unitPrice,
      taxRate,
      amount,
    })),
    payments: document.payments.map(({ amount, paidOn, method }) => ({ amount, paidOn, method })),
    subtotal: document.subtotal,
    tax: document.tax,
    total: document.total,
    paid: document.paid,
    balance: document.balance,
  };
};

const statusCondition = (status: DisplayStatus, today: string) => {
  if (status === "overdue" || status === "expired")
    return and(eq(documents.status, "sent"), lt(documents.dueDate, today));
  if (status === "sent") return and(eq(documents.status, "sent"), gte(documents.dueDate, today));
  return eq(documents.status, status);
};

// Matches the customer name, or the number when the search is a reference like "INV-0012" or "12".
const searchCondition = (search: string) => {
  const number = /^\D*(\d{1,9})$/.exec(search)?.[1];
  return or(
    ilike(customers.name, `%${search.replace(/[\\%_]/g, "\\$&")}%`),
    number === undefined ? undefined : eq(documents.number, Number(number))
  );
};

// ponytail: returns every match with no paging; add a limit and cursor when lists reach thousands.
export const listDocuments = async (
  db: Db,
  type: DocumentType,
  { status, search }: DocumentFilter,
  today = currentDate()
) => {
  const query = search?.trim();
  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      number: documents.number,
      status: documents.status,
      issueDate: documents.issueDate,
      dueDate: documents.dueDate,
      currency: documents.currency,
      customerName: customers.name,
    })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .where(
      and(
        eq(documents.type, type),
        status && statusCondition(status, today),
        query ? searchCondition(query) : undefined
      )
    )
    .orderBy(desc(documents.id));
  const ids = rows.map((row) => row.id);
  const lines =
    ids.length === 0
      ? []
      : await db.select().from(documentLines).where(inArray(documentLines.documentId, ids));
  const linesByDocument = new Map<number, (typeof lines)[number][]>();
  for (const line of lines) {
    linesByDocument.set(line.documentId, [...(linesByDocument.get(line.documentId) ?? []), line]);
  }
  const paid = await paidByDocument(db, ids);
  return rows.map((row) => {
    const { total } = totals(linesByDocument.get(row.id) ?? []);
    return {
      ...row,
      status: displayStatus(row.type, row.status, row.dueDate, today),
      reference: reference(row.type, row.number),
      total,
      balance: total - (paid.get(row.id) ?? 0),
    };
  });
};
