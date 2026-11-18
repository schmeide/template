import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const newQuote = async () => {
  const customer = await caller.customers.create({ name: randomUUID() });
  return caller.quotes.create({
    customerId: customer.id,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    lines: [{ description: "Work", quantity: 1000, unitPrice: 2500, taxRate: 1000 }],
  });
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("conversions router", () => {
  it("converts an accepted quote and reports the link from both sides", async () => {
    const quote = await newQuote();
    await caller.quotes.setStatus({ id: quote.id, status: "sent" });
    await caller.quotes.setStatus({ id: quote.id, status: "accepted" });

    const invoice = await caller.conversions.convert({ quoteId: quote.id });

    expect(await caller.invoices.get({ id: invoice.id })).toMatchObject({
      status: "draft",
      total: 2750,
    });
    expect((await caller.conversions.get({ id: quote.id }))?.invoice.id).toBe(invoice.id);
    expect((await caller.conversions.get({ id: invoice.id }))?.quote.id).toBe(quote.id);
  });

  it("refuses a quote that is not accepted, or converted already, as a conflict", async () => {
    const quote = await newQuote();

    await expect(caller.conversions.convert({ quoteId: quote.id })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
    await caller.quotes.setStatus({ id: quote.id, status: "sent" });
    await caller.quotes.setStatus({ id: quote.id, status: "accepted" });
    await caller.conversions.convert({ quoteId: quote.id });
    await expect(caller.conversions.convert({ quoteId: quote.id })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
  });

  it("returns null for a document with no link", async () => {
    expect(await caller.conversions.get({ id: (await newQuote()).id })).toBeNull();
  });
});
