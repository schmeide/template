import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

// Each test makes its own stage, since other test files add and change stages in parallel.
const newDeal = async (outcome: "won" | null) => {
  const stage = await caller.deals.addStage({ name: randomUUID(), outcome });
  return caller.deals.create({ title: randomUUID(), stageId: stage.id });
};

const withCode = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("deal accounts router", () => {
  it("opens an account for a won deal and reports the link from both sides", async () => {
    const deal = await newDeal("won");

    const account = await caller.dealAccounts.open({ itemId: deal.id });

    expect(await caller.stock.get({ id: account.id })).toMatchObject({ name: deal.title });
    expect((await caller.dealAccounts.byDeal({ id: deal.id }))?.account.id).toBe(account.id);
    expect((await caller.dealAccounts.byAccount({ id: account.id }))?.deal.id).toBe(deal.id);
  });

  it("refuses a deal that is not won, or has its account already, as a conflict", async () => {
    await expect(
      caller.dealAccounts.open({ itemId: (await newDeal(null)).id })
    ).rejects.toMatchObject(withCode("CONFLICT"));
    const won = await newDeal("won");
    await caller.dealAccounts.open({ itemId: won.id });
    await expect(caller.dealAccounts.open({ itemId: won.id })).rejects.toMatchObject(
      withCode("CONFLICT")
    );
  });

  it("returns null for a deal or an account with no link", async () => {
    const deal = await newDeal(null);
    const account = await caller.stock.createAccount({ name: randomUUID() });

    expect(await caller.dealAccounts.byDeal({ id: deal.id })).toBeNull();
    expect(await caller.dealAccounts.byAccount({ id: account.id })).toBeNull();
  });
});
