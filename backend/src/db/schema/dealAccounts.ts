import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { ledgerAccounts } from "./ledger.ts";
import { pipelineItems } from "./pipeline.ts";

// A won deal and the ledger account opened for it. Each side appears at most once, so a deal
// opens one account.
export const dealAccounts = pgTable("deal_accounts", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => pipelineItems.id),
  accountId: integer("account_id")
    .notNull()
    .unique()
    .references(() => ledgerAccounts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const openSchema = createSelectSchema(dealAccounts).pick({ itemId: true });
