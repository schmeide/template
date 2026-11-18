import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  documentInputSchema,
  documents,
  type DocumentType,
  documentStatus,
  documentUpdateSchema,
  lineSchema,
  newPaymentSchema,
} from "../db/schema/documents.ts";
import {
  createDocument,
  getDocument,
  getSharedDocument,
  listDocuments,
  recordPayment,
  setStatus,
  updateDocument,
} from "../services/documents.ts";
import { totals } from "../services/money.ts";
import { procedure, router } from "../trpc.ts";

const selectSchema = createSelectSchema(documents);

const filterSchema = z.object({
  status: z.enum([...documentStatus.enumValues, "overdue", "expired"]).optional(),
  search: z.string().max(200).optional(),
});

const totalsInputSchema = z.object({
  lines: z.array(lineSchema.pick({ quantity: true, unitPrice: true, taxRate: true })).max(200),
});

const orThrow = <T>(value: T | undefined, code: TRPCError["code"], message: string): T => {
  if (value === undefined) throw new TRPCError({ code, message });
  return value;
};

// Invoices and quotes share every procedure; each router sees only its own type.
const documentsRouter = (type: DocumentType) =>
  router({
    list: procedure
      .input(filterSchema)
      .query(({ ctx, input }) => listDocuments(ctx.db, type, input)),
    get: procedure
      .input(selectSchema.pick({ id: true }))
      .query(async ({ ctx, input }) =>
        orThrow(await getDocument(ctx.db, type, input.id), "NOT_FOUND", `No ${type} has that id`)
      ),
    // The one view open to anyone with the link.
    shared: procedure
      .input(z.object({ token: z.uuid() }))
      .query(async ({ ctx, input }) =>
        orThrow(
          await getSharedDocument(ctx.db, type, input.token),
          "NOT_FOUND",
          "This link is not valid"
        )
      ),
    // Live totals for the editor, so the screen rounds exactly as the saved document will.
    totals: procedure.input(totalsInputSchema).query(({ input }) => totals(input.lines)),
    create: procedure
      .input(documentInputSchema)
      .mutation(({ ctx, input }) => createDocument(ctx.db, type, input)),
    update: procedure
      .input(documentUpdateSchema)
      .mutation(async ({ ctx, input }) =>
        orThrow(
          await updateDocument(ctx.db, type, input),
          "CONFLICT",
          `Only draft ${type}s can be edited`
        )
      ),
    setStatus: procedure
      .input(selectSchema.pick({ id: true, status: true }))
      .mutation(async ({ ctx, input }) =>
        orThrow(
          await setStatus(ctx.db, type, input.id, input.status),
          "CONFLICT",
          `This ${type} cannot be marked ${input.status} from its current status`
        )
      ),
    recordPayment: procedure
      .input(newPaymentSchema)
      .mutation(async ({ ctx, input }) =>
        orThrow(
          await recordPayment(ctx.db, input),
          "CONFLICT",
          "Payments can be recorded only on sent invoices, up to the balance due"
        )
      ),
  });

export const invoicesRouter = documentsRouter("invoice");
export const quotesRouter = documentsRouter("quote");
