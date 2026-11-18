import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { newDealDocumentSchema } from "../db/schema/dealDocuments.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { createDealDocument, listDealDocuments } from "../services/dealDocuments.ts";
import { procedure, router } from "../trpc.ts";

export const dealDocumentsRouter = router({
  // Takes the deal's id.
  list: procedure
    .input(createSelectSchema(pipelineItems).pick({ id: true }))
    .query(({ ctx, input }) => listDealDocuments(ctx.db, input.id)),
  create: procedure.input(newDealDocumentSchema).mutation(async ({ ctx, input }) => {
    const document = await createDealDocument(ctx.db, input.itemId, input.type);
    if (document === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No deal has that id" });
    }
    if (document === "no contact") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Set the deal's contact first. A ${input.type} needs a customer.`,
      });
    }
    return document;
  }),
});
