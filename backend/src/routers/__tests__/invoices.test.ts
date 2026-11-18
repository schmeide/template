import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.ts";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
const app = buildApp(db);
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

const line = { description: "Work", quantity: 1000, unitPrice: 2500, taxRate: 1000 };

const newInvoice = async () => {
  const customer = await caller.customers.create({ name: randomUUID() });
  return caller.invoices.create({
    customerId: customer.id,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    lines: [line],
  });
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("invoices router", () => {
  it("creates an invoice that list and get then return", async () => {
    const created = await newInvoice();

    const listed = await caller.invoices.list({});
    const invoice = await caller.invoices.get({ id: created.id });

    expect(listed.map((summary) => summary.id)).toContain(created.id);
    expect(invoice).toMatchObject({ total: 2750, status: "draft" });
  });

  it("previews totals without saving", async () => {
    expect(await caller.invoices.totals({ lines: [line, line] })).toEqual({
      subtotal: 5000,
      tax: 500,
      total: 5500,
    });
  });

  it.each([
    ["a blank line description", { lines: [{ ...line, description: " " }] }],
    ["a zero quantity", { lines: [{ ...line, quantity: 0 }] }],
    ["a fractional amount", { lines: [{ ...line, unitPrice: 1.5 }] }],
    ["a tax rate over 100%", { lines: [{ ...line, taxRate: 10_001 }] }],
    ["a due date before the issue date", { dueDate: "2026-02-01" }],
    ["a malformed date", { issueDate: "March 1" }],
    ["a lowercase currency", { currency: "usd" }],
  ])("rejects %s", async (_label, overrides) => {
    const customer = await caller.customers.create({ name: randomUUID() });
    await expect(
      caller.invoices.create({
        customerId: customer.id,
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        lines: [line],
        ...overrides,
      })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });

  it("reports a missing invoice as not found", async () => {
    await expect(caller.invoices.get({ id: -1 })).rejects.toMatchObject(withCode("NOT_FOUND"));
    await expect(caller.invoices.shared({ token: randomUUID() })).rejects.toMatchObject(
      withCode("NOT_FOUND")
    );
  });

  it("refuses disallowed transitions and edits as conflicts", async () => {
    const created = await newInvoice();
    await caller.invoices.setStatus({ id: created.id, status: "void" });

    await expect(
      caller.invoices.setStatus({ id: created.id, status: "sent" })
    ).rejects.toMatchObject(withCode("CONFLICT"));
    await expect(caller.invoices.update({ ...created, lines: [] })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
    await expect(
      caller.invoices.recordPayment({
        documentId: created.id,
        amount: 1,
        paidOn: "2026-03-02",
        method: "cash",
      })
    ).rejects.toMatchObject(withCode("CONFLICT"));
  });

  it("serves a sent invoice by its share token over http", async () => {
    const created = await newInvoice();
    await caller.invoices.setStatus({ id: created.id, status: "sent" });
    const input = encodeURIComponent(JSON.stringify({ json: { token: created.shareToken } }));

    const response = await app.inject({
      method: "GET",
      url: `/api/trpc/invoices.shared?input=${input}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("2750");
  });
});
