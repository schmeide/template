import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { DocumentInput } from "../../db/schema/documents.ts";
import { createCustomer } from "../customers.ts";
import {
  createDocument,
  getDocument,
  getSharedDocument,
  listDocuments,
  recordPayment,
  setStatus,
  updateDocument,
} from "../documents.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-03-15";

const newInvoice = async (overrides: Partial<DocumentInput> = {}) => {
  const customer = await createCustomer(db, { name: randomUUID() });
  return createDocument(db, "invoice", {
    customerId: customer.id,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    lines: [
      { description: "Labor", quantity: 2500, unitPrice: 4000, taxRate: 2000 },
      { description: "Parts", quantity: 1000, unitPrice: 1999, taxRate: 0 },
    ],
    ...overrides,
  });
};

describe("documents service", () => {
  it("creates a draft with its lines in order and computed totals", async () => {
    const created = await newInvoice();

    const invoice = await getDocument(db, "invoice", created.id, today);

    expect(invoice).toMatchObject({
      status: "draft",
      currency: "USD",
      subtotal: 11_999,
      tax: 2000,
      total: 13_999,
      paid: 0,
      balance: 13_999,
    });
    expect(invoice?.reference).toMatch(/^INV-\d{4,}$/);
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Labor", "Parts"]);
  });

  it("numbers documents one after another", async () => {
    const first = await newInvoice();
    const second = await newInvoice();

    expect(second.number).toBeGreaterThan(first.number);
  });

  it("gives every concurrent create its own number", async () => {
    const created = await Promise.all(Array.from({ length: 8 }, () => newInvoice()));

    expect(new Set(created.map((invoice) => invoice.number)).size).toBe(8);
  });

  it("replaces the fields and lines of a draft", async () => {
    const created = await newInvoice();

    await updateDocument(db, "invoice", {
      id: created.id,
      customerId: created.customerId,
      issueDate: "2026-03-02",
      dueDate: "2026-04-02",
      notes: "Thanks",
      currency: "EUR",
      lines: [{ description: "Only", quantity: 1000, unitPrice: 100, taxRate: 0 }],
    });
    const invoice = await getDocument(db, "invoice", created.id, today);

    expect(invoice).toMatchObject({ notes: "Thanks", currency: "EUR", total: 100 });
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Only"]);
  });

  it("does not edit a document once it is sent", async () => {
    const created = await newInvoice();
    await setStatus(db, "invoice", created.id, "sent");

    const updated = await updateDocument(db, "invoice", { ...created, lines: [] });

    expect(updated).toBeUndefined();
    expect((await getDocument(db, "invoice", created.id, today))?.lines).toHaveLength(2);
  });

  it.each([
    [["sent"], "sent"],
    [["void"], "void"],
    [["sent", "paid"], "paid"],
    [["sent", "void"], "void"],
  ] as const)("allows %j", async (steps, final) => {
    const created = await newInvoice();

    for (const step of steps) {
      expect(await setStatus(db, "invoice", created.id, step)).toMatchObject({ status: step });
    }

    expect((await getDocument(db, "invoice", created.id, today))?.status).toBe(final);
  });

  it.each([
    [[], "paid"],
    [["void"], "sent"],
    [["sent", "paid"], "void"],
    [["sent"], "draft"],
    [["sent"], "sent"],
  ] as const)("after %j refuses %s", async (steps, refused) => {
    const created = await newInvoice();
    for (const step of steps) await setStatus(db, "invoice", created.id, step);

    expect(await setStatus(db, "invoice", created.id, refused)).toBeUndefined();
  });

  it("derives overdue from the due date of a sent document", async () => {
    const created = await newInvoice({ dueDate: "2026-03-10" });
    expect((await getDocument(db, "invoice", created.id, today))?.status).toBe("draft");

    await setStatus(db, "invoice", created.id, "sent");

    expect((await getDocument(db, "invoice", created.id, "2026-03-10"))?.status).toBe("sent");
    expect((await getDocument(db, "invoice", created.id, today))?.status).toBe("overdue");
  });

  it("records payments and marks the document paid once covered", async () => {
    const created = await newInvoice();
    await setStatus(db, "invoice", created.id, "sent");
    const payment = { documentId: created.id, paidOn: today, method: "card" } as const;

    await recordPayment(db, { ...payment, amount: 10_000 });
    expect(await getDocument(db, "invoice", created.id, today)).toMatchObject({
      status: "sent",
      paid: 10_000,
      balance: 3999,
    });

    await recordPayment(db, { ...payment, amount: 3999 });
    const invoice = await getDocument(db, "invoice", created.id, today);
    expect(invoice).toMatchObject({ status: "paid", balance: 0 });
    expect(invoice?.payments).toHaveLength(2);
  });

  it("refuses a payment on a draft or above the balance", async () => {
    const created = await newInvoice();
    const payment = { documentId: created.id, paidOn: today, method: "cash", amount: 1 } as const;

    expect(await recordPayment(db, payment)).toBeUndefined();
    await setStatus(db, "invoice", created.id, "sent");
    expect(await recordPayment(db, { ...payment, amount: 14_000 })).toBeUndefined();
  });

  it("filters by status, overdue included, and searches by customer or number", async () => {
    const name = randomUUID();
    const customer = await createCustomer(db, { name });
    const base = { customerId: customer.id, issueDate: "2026-03-01", lines: [] };
    const draft = await createDocument(db, "invoice", { ...base, dueDate: "2026-03-31" });
    const late = await createDocument(db, "invoice", { ...base, dueDate: "2026-03-05" });
    await setStatus(db, "invoice", late.id, "sent");

    const ids = async (filter: Parameters<typeof listDocuments>[2]) =>
      (await listDocuments(db, "invoice", filter, today)).map((invoice) => invoice.id);

    expect(await ids({ search: name })).toEqual([late.id, draft.id]);
    expect(await ids({ search: name, status: "draft" })).toEqual([draft.id]);
    expect(await ids({ search: name, status: "overdue" })).toEqual([late.id]);
    expect(await ids({ search: name, status: "sent" })).toEqual([]);
    expect(await ids({ search: `INV-${String(late.number).padStart(4, "0")}` })).toContain(late.id);
  });

  it("shares a document by token once it is sent, without internal ids", async () => {
    const created = await newInvoice();
    expect(await getSharedDocument(db, "invoice", created.shareToken, today)).toBeUndefined();

    await setStatus(db, "invoice", created.id, "sent");
    const shared = await getSharedDocument(db, "invoice", created.shareToken, today);

    expect(shared).toMatchObject({ total: 13_999, status: "sent" });
    expect(shared).not.toHaveProperty("id");
    expect(shared).not.toHaveProperty("shareToken");
    expect(await getSharedDocument(db, "invoice", randomUUID(), today)).toBeUndefined();
  });
});

describe("quotes", () => {
  const newQuote = async (overrides: Partial<DocumentInput> = {}) => {
    const customer = await createCustomer(db, { name: randomUUID() });
    return createDocument(db, "quote", {
      customerId: customer.id,
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      lines: [{ description: "Labor", quantity: 1000, unitPrice: 5000, taxRate: 0 }],
      ...overrides,
    });
  };

  it("numbers quotes apart from invoices, with their own prefix", async () => {
    const first = await newQuote();
    await newInvoice();
    const second = await newQuote();

    expect(second.number).toBe(first.number + 1);
    expect((await getDocument(db, "quote", first.id, today))?.reference).toMatch(/^Q-\d{4,}$/);
  });

  it("keeps quotes and invoices apart in get and list", async () => {
    const quote = await newQuote();
    const invoice = await newInvoice();

    expect(await getDocument(db, "invoice", quote.id, today)).toBeUndefined();
    expect(await getDocument(db, "quote", invoice.id, today)).toBeUndefined();
    const listed = (await listDocuments(db, "quote", {}, today)).map((row) => row.id);
    expect(listed).toContain(quote.id);
    expect(listed).not.toContain(invoice.id);
  });

  it.each([
    [["sent", "accepted"], "accepted"],
    [["sent", "declined"], "declined"],
    [["sent", "void"], "void"],
    [["void"], "void"],
  ] as const)("allows %j", async (steps, final) => {
    const created = await newQuote();

    for (const step of steps) {
      expect(await setStatus(db, "quote", created.id, step)).toMatchObject({ status: step });
    }

    expect((await getDocument(db, "quote", created.id, today))?.status).toBe(final);
  });

  it.each([
    [[], "accepted"],
    [["sent"], "paid"],
    [["sent", "accepted"], "void"],
    [["sent", "declined"], "accepted"],
  ] as const)("after %j refuses %s", async (steps, refused) => {
    const created = await newQuote();
    for (const step of steps) await setStatus(db, "quote", created.id, step);

    expect(await setStatus(db, "quote", created.id, refused)).toBeUndefined();
  });

  it("does not accept an invoice or change a document through the other type", async () => {
    const invoice = await newInvoice();
    await setStatus(db, "invoice", invoice.id, "sent");

    expect(await setStatus(db, "invoice", invoice.id, "accepted")).toBeUndefined();
    expect(await setStatus(db, "quote", invoice.id, "void")).toBeUndefined();
    expect(await updateDocument(db, "quote", { ...(await newInvoice()), lines: [] })).toBe(
      undefined
    );
  });

  it("derives expired from the valid-until date of a sent quote", async () => {
    const created = await newQuote({ dueDate: "2026-03-10" });
    await setStatus(db, "quote", created.id, "sent");

    expect((await getDocument(db, "quote", created.id, "2026-03-10"))?.status).toBe("sent");
    expect((await getDocument(db, "quote", created.id, today))?.status).toBe("expired");
    const expired = await listDocuments(db, "quote", { status: "expired" }, today);
    expect(expired.map((row) => row.id)).toContain(created.id);
  });

  it("takes no payments", async () => {
    const created = await newQuote();
    await setStatus(db, "quote", created.id, "sent");

    expect(
      await recordPayment(db, { documentId: created.id, paidOn: today, method: "cash", amount: 1 })
    ).toBeUndefined();
  });
});
