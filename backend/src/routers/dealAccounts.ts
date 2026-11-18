import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { openSchema } from "../db/schema/dealAccounts.ts";
import { ledgerAccounts } from "../db/schema/ledger.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { getAccountLink, getDealLink, openAccount } from "../services/dealAccounts.ts";
import { procedure, router } from "../trpc.ts";

export const dealAccountsRouter = router({
  byDeal: procedure
    .input(createSelectSchema(pipelineItems).pick({ id: true }))
    .query(({ ctx, input }) => getDealLink(ctx.db, input.id)),
  byAccount: procedure
    .input(createSelectSchema(ledgerAccounts).pick({ id: true }))
    .query(({ ctx, input }) => getAccountLink(ctx.db, input.id)),
  open: procedure.input(openSchema).mutation(async ({ ctx, input }) => {
    const account = await openAccount(ctx.db, input.itemId);
    if (!account) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only a won deal that has no project yet can open one",
      });
    }
    return account;
  }),
});
