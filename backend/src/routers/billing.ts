import { TRPCError } from "@trpc/server";
import { billingAccountSchema, billingPeriodSchema } from "../db/schema/billing.ts";
import { createSelectSchema } from "drizzle-zod";
import { ledgerAccounts } from "../db/schema/ledger.ts";
import {
  billEntries,
  getBillingAccount,
  previewBill,
  setBillingAccount,
} from "../services/billing.ts";
import { procedure, router } from "../trpc.ts";

const noBilling = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Set the customer and hourly rate for this item first",
  });

export const billingRouter = router({
  // Takes the ledger account's id; null when it has no billing yet.
  get: procedure
    .input(createSelectSchema(ledgerAccounts).pick({ id: true }))
    .query(({ ctx, input }) => getBillingAccount(ctx.db, input.id)),
  set: procedure
    .input(billingAccountSchema)
    .mutation(({ ctx, input }) => setBillingAccount(ctx.db, input)),
  preview: procedure.input(billingPeriodSchema).query(async ({ ctx, input }) => {
    const preview = await previewBill(ctx.db, input);
    if (!preview) throw noBilling();
    return preview;
  }),
  bill: procedure.input(billingPeriodSchema).mutation(async ({ ctx, input }) => {
    const result = await billEntries(ctx.db, input);
    if (result === "no billing") throw noBilling();
    if (result === "nothing to bill") {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Nothing to bill in this period: no unbilled entries, or credits that cancel them. Credits wait for the next invoice.",
      });
    }
    return result;
  }),
});
