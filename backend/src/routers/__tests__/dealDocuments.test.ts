import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const newDeal = async (withContact = true) => {
  const customer = await caller.customers.create({ name: randomUUID() });
  const stage = await caller.deals.addStage({ name: randomUUID() });
  return caller.deals.create({
    title: "Boiler service",
    stageId: stage.id,
    customerId: withContact ? customer.id : null,
  });
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("deal documents router", () => {
  it("makes a quote and an invoice for a deal and lists them", async () => {
    const deal = await newDeal();

    const quote = await caller.dealDocuments.create({ itemId: deal.id, type: "quote" });
    const invoice = await caller.dealDocuments.create({ itemId: deal.id, type: "invoice" });

    expect(await caller.quotes.get({ id: quote.id })).toMatchObject({ status: "draft" });
    expect(await caller.invoices.get({ id: invoice.id })).toMatchObject({ status: "draft" });
    expect((await caller.dealDocuments.list({ id: deal.id })).map((row) => row.id)).toEqual([
      invoice.id,
      quote.id,
    ]);
  });

  it("asks for the contact first on a deal without one", async () => {
    const deal = await newDeal(false);

    await expect(
      caller.dealDocuments.create({ itemId: deal.id, type: "quote" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringMatching(/set the deal's contact first/i),
    });
  });

  it("reports a missing deal and rejects an unknown type", async () => {
    await expect(
      caller.dealDocuments.create({ itemId: -1, type: "invoice" })
    ).rejects.toMatchObject(withCode("NOT_FOUND"));
    await expect(
      caller.dealDocuments.create({ itemId: 1, type: "receipt" as "invoice" })
    ).rejects.toMatchObject(withCode("BAD_REQUEST"));
  });
});
