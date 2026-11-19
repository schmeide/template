import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { documents } from "../db/schema/documents.ts";
import { billPeriodSchema } from "../db/schema/dues.ts";
import { membershipPeriods } from "../db/schema/membership.ts";
import { billPeriod, getForInvoice, getForPeriod } from "../services/dues.ts";
import { procedure, router } from "../trpc.ts";

export const duesRouter = router({
  forPeriod: procedure
    .input(createSelectSchema(membershipPeriods).pick({ id: true }))
    .query(({ ctx, input }) => getForPeriod(ctx.db, input.id)),
  forInvoice: procedure
    .input(createSelectSchema(documents).pick({ id: true }))
    .query(({ ctx, input }) => getForInvoice(ctx.db, input.id)),
  bill: procedure.input(billPeriodSchema).mutation(async ({ ctx, input }) => {
    const result = await billPeriod(ctx.db, input.periodId);
    if (result === "not found") {
      throw new TRPCError({ code: "NOT_FOUND", message: "No period has that id" });
    }
    if (result === "no fee") {
      throw new TRPCError({ code: "CONFLICT", message: "This period has no fee to bill" });
    }
    if (result === "billed") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This period is already on an invoice. Void that invoice to bill it again.",
      });
    }
    return result;
  }),
});
