import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { approvalRequests } from "../db/schema/approval.ts";
import { newDealRequestSchema } from "../db/schema/dealRequests.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { createDealRequest, getRequestDeal, listDealRequests } from "../services/dealRequests.ts";
import { procedure, router } from "../trpc.ts";

export const dealRequestsRouter = router({
  // Takes the deal's id.
  list: procedure
    .input(createSelectSchema(pipelineItems).pick({ id: true }))
    .query(({ ctx, input }) => listDealRequests(ctx.db, input.id)),
  // Takes the request's id.
  deal: procedure
    .input(createSelectSchema(approvalRequests).pick({ id: true }))
    .query(({ ctx, input }) => getRequestDeal(ctx.db, input.id)),
  create: procedure.input(newDealRequestSchema).mutation(async ({ ctx, input }) => {
    const request = await createDealRequest(ctx.db, input);
    if (!request) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That deal or request type no longer exists. Reload the page.",
      });
    }
    return request;
  }),
});
