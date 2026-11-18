import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { dealDocuments } from "../../db/schema/dealDocuments.ts";
import { createCustomer } from "../customers.ts";
import { createDealDocument, listDealDocuments } from "../dealDocuments.ts";
import { createDocument, getDocument, setStatus, updateDocument } from "../documents.ts";
import { addStage, createItem, getItem, updateItem } from "../pipeline.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-03-15";

const newDeal = async (withContact = true) => {
  const customer = await createCustomer(db, { name: randomUUID() });
  const stage = await addStage(db, { name: randomUUID() });
  const deal = await createItem(db, {
    title: randomUUID(),
    stageId: stage.id,
    customerId: withContact ? customer.id : null,
  });
  if (!deal) throw new Error("expected a deal");
  return { deal, customer };
};

const made = <T>(result: T | "no contact" | undefined): T => {
  if (result === undefined || result === "no contact") throw new Error("expected a document");
  return result;
};

describe("deal documents service", () => {
  it.each(["quote", "invoice"] as const)(
    "makes a draft %s for the deal's contact and lists it on the deal",
    async (type) => {
      const { deal, customer } = await newDeal();

      const document = made(await createDealDocument(db, deal.id, type, today));

      expect(await getDocument(db, type, document.id, today)).toMatchObject({
        status: "draft",
        customerId: customer.id,
        issueDate: today,
        dueDate: "2026-04-14",
        lines: [],
      });
      expect(await listDealDocuments(db, deal.id, today)).toEqual([
        {
          id: document.id,
          type,
          reference: expect.stringMatching(type === "quote" ? /^Q-\d{4,}$/ : /^INV-\d{4,}$/),
          status: "draft",
          currency: "USD",
          total: 0,
        },
      ]);
    }
  );

  it("lists a deal's documents with their current status and total, newest first", async () => {
    const { deal } = await newDeal();
    const quote = made(await createDealDocument(db, deal.id, "quote", today));
    const invoice = made(await createDealDocument(db, deal.id, "invoice", today));
    await updateDocument(db, "quote", {
      ...quote,
      lines: [{ description: "Work", quantity: 2000, unitPrice: 5000, taxRate: 1000 }],
    });
    await setStatus(db, "quote", quote.id, "sent");

    const listed = await listDealDocuments(db, deal.id, today);

    expect(listed.map((document) => document.id)).toEqual([invoice.id, quote.id]);
    expect(listed[1]).toMatchObject({ status: "sent", total: 11_000 });
  });

  it("refuses a deal with no contact, since the document needs a customer", async () => {
    const { deal } = await newDeal(false);

    expect(await createDealDocument(db, deal.id, "invoice", today)).toBe("no contact");
    expect(await listDealDocuments(db, deal.id, today)).toEqual([]);
  });

  it("refuses a deal that does not exist", async () => {
    expect(await createDealDocument(db, -1, "quote", today)).toBeUndefined();
  });

  it("links a document to at most one deal", async () => {
    const { deal, customer } = await newDeal();
    const other = await newDeal();
    const document = made(await createDealDocument(db, deal.id, "quote", today));

    await expect(
      db.insert(dealDocuments).values({ itemId: other.deal.id, documentId: document.id })
    ).rejects.toThrow();
    expect(await listDealDocuments(db, other.deal.id, today)).toEqual([]);
    const unlinked = await createDocument(db, "invoice", {
      customerId: customer.id,
      issueDate: today,
      dueDate: today,
      lines: [],
    });
    expect((await listDealDocuments(db, deal.id, today)).map((row) => row.id)).toEqual([
      document.id,
    ]);
    expect(unlinked.id).not.toBe(document.id);
  });

  it("changes neither the deal's stage nor the document's status", async () => {
    const { deal } = await newDeal();
    const before = await getItem(db, deal.id);

    const invoice = made(await createDealDocument(db, deal.id, "invoice", today));
    await setStatus(db, "invoice", invoice.id, "sent");
    const quote = made(await createDealDocument(db, deal.id, "quote", today));

    const after = await getItem(db, deal.id);
    expect(after?.stageId).toBe(before?.stageId);
    expect(after?.position).toBe(before?.position);
    expect(after?.activity).toEqual([]);
    expect((await getDocument(db, "invoice", invoice.id, today))?.status).toBe("sent");
    expect((await getDocument(db, "quote", quote.id, today))?.status).toBe("draft");
  });

  it("makes two documents with their own numbers when two people add one at once", async () => {
    const { deal } = await newDeal();

    const results = await Promise.all([
      createDealDocument(db, deal.id, "invoice", today),
      createDealDocument(db, deal.id, "invoice", today),
    ]);

    const [a, b] = results.map(made);
    expect(a.id).not.toBe(b.id);
    expect(a.number).not.toBe(b.number);
    const rows = await db.select().from(dealDocuments).where(eq(dealDocuments.itemId, deal.id));
    expect(rows.map((row) => row.documentId).sort()).toEqual([a.id, b.id].sort());
  });

  it("bills only the contact the deal has when another person clears it at once", async () => {
    const { deal, customer } = await newDeal();

    const [result] = await Promise.all([
      createDealDocument(db, deal.id, "quote", today),
      updateItem(db, { id: deal.id, title: deal.title, customerId: null }),
    ]);

    // Either the document came first, for the contact the deal had then, or the clear did.
    const document = result === "no contact" ? undefined : made(result);
    expect([undefined, customer.id]).toContain(document?.customerId);
    expect((await listDealDocuments(db, deal.id, today)).map((row) => row.id)).toEqual(
      document ? [document.id] : []
    );
    expect((await getItem(db, deal.id))?.customerId).toBeNull();
  });
});
