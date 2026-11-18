import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { convertSchema } from "../db/schema/conversions.ts";
import { documents } from "../db/schema/documents.ts";
import { convertQuote, getConversion } from "../services/conversions.ts";
import { procedure, router } from "../trpc.ts";

export const conversionsRouter = router({
  // Takes a quote's id or an invoice's.
  get: procedure
    .input(createSelectSchema(documents).pick({ id: true }))
    .query(({ ctx, input }) => getConversion(ctx.db, input.id)),
  convert: procedure.input(convertSchema).mutation(async ({ ctx, input }) => {
    const invoice = await convertQuote(ctx.db, input.quoteId);
    if (!invoice) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only an accepted quote that has no invoice yet can be made into an invoice",
      });
    }
    return invoice;
  }),
});
