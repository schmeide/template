import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { dealDocuments } from "../db/schema/dealDocuments.ts";
import { documents, type DocumentType } from "../db/schema/documents.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { currentDate, getDocument, insertDocument, type Document } from "./documents.ts";

// A new document is due (an invoice) or valid until (a quote) this many days after today, as in
// the invoice editor.
const termDays = 30;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Makes an empty draft quote or invoice for the deal's contact and links it to the deal.
// Returns "no contact" when the deal has none, and undefined when there is no such deal.
export const createDealDocument = (
  db: Db,
  itemId: number,
  type: DocumentType,
  today = currentDate()
): Promise<Document | "no contact" | undefined> =>
  db.transaction(async (tx) => {
    // The share lock holds the contact still until commit, so a document is never made for a
    // contact someone has just cleared; two documents for one deal can still be made at once.
    const [deal] = await tx
      .select({ customerId: pipelineItems.customerId })
      .from(pipelineItems)
      .where(eq(pipelineItems.id, itemId))
      .for("share");
    if (!deal) return undefined;
    if (deal.customerId === null) return "no contact";
    const document = await insertDocument(tx, type, {
      customerId: deal.customerId,
      issueDate: today,
      dueDate: addDays(today, termDays),
      lines: [],
    });
    await tx.insert(dealDocuments).values({ itemId, documentId: document.id });
    return document;
  });

// The deal's documents, newest first, with the status and total their own pages show.
// ponytail: one query per document; fine for the handful a deal has, batch it if that grows.
export const listDealDocuments = async (db: Db, itemId: number, today = currentDate()) => {
  const links = await db
    .select({ id: documents.id, type: documents.type })
    .from(dealDocuments)
    .innerJoin(documents, eq(dealDocuments.documentId, documents.id))
    .where(eq(dealDocuments.itemId, itemId))
    .orderBy(desc(documents.id));
  const found = await Promise.all(links.map((link) => getDocument(db, link.type, link.id, today)));
  return found
    .filter((document) => document !== undefined)
    .map(({ id, type, reference, status, currency, total }) => ({
      id,
      type,
      reference,
      status,
      currency,
      total,
    }));
};
