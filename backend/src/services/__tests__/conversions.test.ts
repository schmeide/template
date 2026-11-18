import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { documentConversions } from "../../db/schema/conversions.ts";
import type { DocumentStatus } from "../../db/schema/documents.ts";
import { convertQuote, getConversion } from "../conversions.ts";
import { createCustomer } from "../customers.ts";
import {
  createDocument,
  getDocument,
  listDocuments,
  setStatus,
  updateDocument,
} from "../documents.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-03-15";

const newQuote = async (steps: readonly DocumentStatus[] = ["sent", "accepted"]) => {
  const name = randomUUID();
  const customer = await createCustomer(db, { name });
  const quote = await createDocument(db, "quote", {
    customerId: customer.id,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    notes: "Valid for thirty days.",
    currency: "EUR",
    lines: [
      { description: "Labor", quantity: 2500, unitPrice: 4000, taxRate: 2000 },
      { description: "Parts", quantity: 1000, unitPrice: 1999, taxRate: 0 },
    ],
  });
  for (const step of steps) await setStatus(db, "quote", quote.id, step);
  return { quote, name };
};

const invoicesFor = async (name: string) => listDocuments(db, "invoice", { search: name }, today);

describe("conversions service", () => {
  it("makes an accepted quote into a draft invoice with a copy of its lines", async () => {
    const { quote } = await newQuote();

    const made = await convertQuote(db, quote.id, today);

    const invoice = await getDocument(db, "invoice", made?.id ?? -1, today);
    expect(invoice).toMatchObject({
      status: "draft",
      customerId: quote.customerId,
      currency: "EUR",
      notes: "Valid for thirty days.",
      issueDate: today,
      dueDate: "2026-04-14",
      total: 13_999,
    });
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Labor", "Parts"]);
  });

  it("links the quote and the invoice both ways", async () => {
    const { quote } = await newQuote();
    expect(await getConversion(db, quote.id)).toBeNull();

    const made = await convertQuote(db, quote.id, today);

    const link = {
      quote: { id: quote.id, reference: expect.stringMatching(/^Q-\d{4,}$/) },
      invoice: { id: made?.id, reference: expect.stringMatching(/^INV-\d{4,}$/) },
    };
    expect(await getConversion(db, quote.id)).toEqual(link);
    expect(await getConversion(db, made?.id ?? -1)).toEqual(link);
  });

  it.each([[[]], [["sent"]], [["sent", "declined"]], [["void"]]] as const)(
    "refuses a quote after %j, since only an accepted quote converts",
    async (steps) => {
      const { quote, name } = await newQuote(steps);

      expect(await convertQuote(db, quote.id, today)).toBeUndefined();
      expect(await invoicesFor(name)).toEqual([]);
    }
  );

  it("refuses an invoice", async () => {
    const { quote } = await newQuote();
    const made = await convertQuote(db, quote.id, today);

    expect(await convertQuote(db, made?.id ?? -1, today)).toBeUndefined();
  });

  it("converts a quote once", async () => {
    const { quote, name } = await newQuote();

    expect(await convertQuote(db, quote.id, today)).toBeDefined();
    expect(await convertQuote(db, quote.id, today)).toBeUndefined();
    expect(await invoicesFor(name)).toHaveLength(1);
  });

  it("makes one invoice when two people convert the same quote at once", async () => {
    const { quote, name } = await newQuote();

    const results = await Promise.all([
      convertQuote(db, quote.id, today),
      convertQuote(db, quote.id, today),
    ]);

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    expect(await invoicesFor(name)).toHaveLength(1);
    const rows = await db
      .select()
      .from(documentConversions)
      .where(eq(documentConversions.quoteId, quote.id));
    expect(rows).toHaveLength(1);
  });

  it("leaves the quote alone when the invoice is edited", async () => {
    const { quote } = await newQuote();
    const made = await convertQuote(db, quote.id, today);
    if (!made) throw new Error("expected an invoice");

    await updateDocument(db, "invoice", {
      ...made,
      lines: [{ description: "Changed", quantity: 1000, unitPrice: 1, taxRate: 0 }],
    });

    const unchanged = await getDocument(db, "quote", quote.id, today);
    expect(unchanged?.lines.map((line) => line.description)).toEqual(["Labor", "Parts"]);
    expect(unchanged?.status).toBe("accepted");
  });

  it("does not free the quote when the invoice is voided", async () => {
    const { quote, name } = await newQuote();
    const made = await convertQuote(db, quote.id, today);
    await setStatus(db, "invoice", made?.id ?? -1, "void");

    expect(await convertQuote(db, quote.id, today)).toBeUndefined();
    expect(await invoicesFor(name)).toHaveLength(1);
    expect((await getConversion(db, quote.id))?.invoice.id).toBe(made?.id);
  });
});
