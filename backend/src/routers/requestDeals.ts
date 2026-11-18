import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { approvalRequests } from "../db/schema/approval.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { convertRequestSchema } from "../db/schema/requestDeals.ts";
import { convertRequest, getForDeal, getForRequest } from "../services/requestDeals.ts";
import { procedure, router } from "../trpc.ts";

export const requestDealsRouter = router({
  forRequest: procedure
    .input(createSelectSchema(approvalRequests).pick({ id: true }))
    .query(({ ctx, input }) => getForRequest(ctx.db, input.id)),
  forDeal: procedure
    .input(createSelectSchema(pipelineItems).pick({ id: true }))
    .query(({ ctx, input }) => getForDeal(ctx.db, input.id)),
  convert: procedure.input(convertRequestSchema).mutation(async ({ ctx, input }) => {
    const deal = await convertRequest(ctx.db, input);
    if (!deal) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Only an approved request with no deal yet can be made into a deal, for a customer that exists",
      });
    }
    return deal;
  }),
});
