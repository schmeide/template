import { and, asc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client.ts";
import { documentConversions } from "../db/schema/conversions.ts";
import { documentLines, documents } from "../db/schema/documents.ts";
import { currentDate, insertDocument, reference, type Document } from "./documents.ts";

// The invoice is due this many days after it is made, as in the invoice editor.
const paymentDays = 30;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Makes an accepted quote into a draft invoice for the same customer with a copy of its lines.
// Returns undefined when the document is not an accepted quote or already has its invoice.
export const convertQuote = (
  db: Db,
  quoteId: number,
  today = currentDate()
): Promise<Document | undefined> =>
  db.transaction(async (tx) => {
    // The row lock makes a second conversion of the same quote wait, then find the first one.
    const [quote] = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, quoteId),
          eq(documents.type, "quote"),
          eq(documents.status, "accepted")
        )
      )
      .for("update");
    if (!quote) return undefined;
    const [converted] = await tx
      .select()
      .from(documentConversions)
      .where(eq(documentConversions.quoteId, quoteId));
    if (converted) return undefined;
    const lines = await tx
      .select({
        description: documentLines.description,
        quantity: documentLines.quantity,
        unitPrice: documentLines.unitPrice,
        taxRate: documentLines.taxRate,
      })
      .from(documentLines)
      .where(eq(documentLines.documentId, quoteId))
      .orderBy(asc(documentLines.position));
    const invoice = await insertDocument(tx, "invoice", {
      customerId: quote.customerId,
      issueDate: today,
      dueDate: addDays(today, paymentDays),
      notes: quote.notes,
      currency: quote.currency,
      lines,
    });
    await tx.insert(documentConversions).values({ quoteId, invoiceId: invoice.id });
    return invoice;
  });

const quotes = alias(documents, "quotes");
const invoices = alias(documents, "invoices");

// The quote and invoice linked to a document from either side, or null when it has no link.
export const getConversion = async (db: Db, documentId: number) => {
  const [row] = await db
    .select({ quote: quotes, invoice: invoices })
    .from(documentConversions)
    .innerJoin(quotes, eq(documentConversions.quoteId, quotes.id))
    .innerJoin(invoices, eq(documentConversions.invoiceId, invoices.id))
    .where(
      or(eq(documentConversions.quoteId, documentId), eq(documentConversions.invoiceId, documentId))
    );
  if (!row) return null;
  const side = (document: Document) => ({
    id: document.id,
    reference: reference(document.type, document.number),
  });
  return { quote: side(row.quote), invoice: side(row.invoice) };
};
