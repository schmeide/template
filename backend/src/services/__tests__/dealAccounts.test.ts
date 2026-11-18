import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { dealAccounts } from "../../db/schema/dealAccounts.ts";
import { ledgerAccounts } from "../../db/schema/ledger.ts";
import { getAccountLink, getDealLink, openAccount } from "../dealAccounts.ts";
import { addEntry, getAccount } from "../ledger.ts";
import { addStage, createItem, moveItem } from "../pipeline.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

// Each test makes its own stage, since other test files add and change stages in parallel.
const stageWith = async (outcome: "won" | "lost" | null) =>
  (await addStage(db, { name: randomUUID(), outcome })).id;

const newDeal = async (outcome: "won" | "lost" | null = "won") => {
  const title = randomUUID();
  const deal = await createItem(db, { title, stageId: await stageWith(outcome) });
  if (!deal) throw new Error("expected a deal");
  return deal;
};

const accountsNamed = (name: string) =>
  db.select().from(ledgerAccounts).where(eq(ledgerAccounts.name, name));

describe("deal accounts service", () => {
  it("opens an account named after a won deal and links them both ways", async () => {
    const deal = await newDeal();
    expect(await getDealLink(db, deal.id)).toBeNull();

    const account = await openAccount(db, deal.id);

    expect(account?.name).toBe(deal.title);
    const link = {
      deal: { id: deal.id, title: deal.title },
      account: { id: account?.id, name: deal.title },
    };
    expect(await getDealLink(db, deal.id)).toEqual(link);
    expect(await getAccountLink(db, account?.id ?? -1)).toEqual(link);
  });

  it.each([null, "lost"] as const)(
    "refuses a deal in a stage with outcome %s, since only a won deal opens one",
    async (outcome) => {
      const deal = await newDeal(outcome);

      expect(await openAccount(db, deal.id)).toBeUndefined();
      expect(await accountsNamed(deal.title)).toEqual([]);
      expect(await getDealLink(db, deal.id)).toBeNull();
    }
  );

  it("refuses a deal that does not exist", async () => {
    expect(await openAccount(db, -1)).toBeUndefined();
  });

  it("opens one account per deal", async () => {
    const deal = await newDeal();

    expect(await openAccount(db, deal.id)).toBeDefined();
    expect(await openAccount(db, deal.id)).toBeUndefined();
    expect(await accountsNamed(deal.title)).toHaveLength(1);
  });

  it("opens one account when two people open it for the same deal at once", async () => {
    const deal = await newDeal();

    const results = await Promise.all([openAccount(db, deal.id), openAccount(db, deal.id)]);

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    expect(await accountsNamed(deal.title)).toHaveLength(1);
    const rows = await db.select().from(dealAccounts).where(eq(dealAccounts.itemId, deal.id));
    expect(rows).toHaveLength(1);
  });

  it("holds an account to one deal in the database", async () => {
    const first = await newDeal();
    const second = await newDeal();
    const account = await openAccount(db, first.id);

    await expect(
      db.insert(dealAccounts).values({ itemId: second.id, accountId: account?.id ?? -1 })
    ).rejects.toThrow();
  });

  it("keeps the account and its entries when the deal moves out of the won stage", async () => {
    const deal = await newDeal();
    const account = await openAccount(db, deal.id);
    if (!account) throw new Error("expected an account");
    await addEntry(db, {
      accountId: account.id,
      kind: "in",
      quantity: 90,
      entryDate: "2026-03-02",
    });

    await moveItem(db, { id: deal.id, stageId: await stageWith(null), position: 0 });

    expect((await getDealLink(db, deal.id))?.account.id).toBe(account.id);
    expect((await getAccount(db, account.id))?.entries).toHaveLength(1);
    expect(await openAccount(db, deal.id)).toBeUndefined();
  });
});
