import { eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { dealAccounts } from "../db/schema/dealAccounts.ts";
import { ledgerAccounts, type Account } from "../db/schema/ledger.ts";
import { pipelineItems, pipelineStages } from "../db/schema/pipeline.ts";
import { createAccount } from "./ledger.ts";

// Opens a ledger account named after a won deal and links them.
// Returns undefined when the deal is missing, not in a won stage, or has its account already.
export const openAccount = (db: Db, itemId: number): Promise<Account | undefined> =>
  db.transaction(async (tx) => {
    // The row lock makes a second open of the same deal wait, then find the first one. The stage
    // is read after it, so a move that committed meanwhile is seen.
    const [deal] = await tx
      .select()
      .from(pipelineItems)
      .where(eq(pipelineItems.id, itemId))
      .for("update");
    if (!deal) return undefined;
    const [stage] = await tx
      .select({ outcome: pipelineStages.outcome })
      .from(pipelineStages)
      .where(eq(pipelineStages.id, deal.stageId));
    if (stage?.outcome !== "won") return undefined;
    const [linked] = await tx.select().from(dealAccounts).where(eq(dealAccounts.itemId, itemId));
    if (linked) return undefined;
    const account = await createAccount(tx, { name: deal.title });
    await tx.insert(dealAccounts).values({ itemId, accountId: account.id });
    return account;
  });

const findLink = async (db: Db, where: SQL) => {
  const [row] = await db
    .select({
      deal: { id: pipelineItems.id, title: pipelineItems.title },
      account: { id: ledgerAccounts.id, name: ledgerAccounts.name },
    })
    .from(dealAccounts)
    .innerJoin(pipelineItems, eq(dealAccounts.itemId, pipelineItems.id))
    .innerJoin(ledgerAccounts, eq(dealAccounts.accountId, ledgerAccounts.id))
    .where(where);
  return row ?? null;
};

// The deal and account linked to a deal, or null when it has none.
export const getDealLink = (db: Db, itemId: number) =>
  findLink(db, eq(dealAccounts.itemId, itemId));

// The deal and account linked to an account, or null when it has none.
export const getAccountLink = (db: Db, accountId: number) =>
  findLink(db, eq(dealAccounts.accountId, accountId));
