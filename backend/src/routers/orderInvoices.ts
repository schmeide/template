import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { idSchema } from "../db/schema/catalog.ts";
import { documents } from "../db/schema/documents.ts";
import { invoiceOrderSchema } from "../db/schema/orderInvoices.ts";
import { getInvoiceOrder, getOrderInvoice, invoiceOrder } from "../services/orderInvoices.ts";
import { procedure, router } from "../trpc.ts";

const refusals = {
  "not fulfilled": "Only a fulfilled order is invoiced. Reload it to see where it stands.",
  "already invoiced":
    "This order already has an invoice. Void that invoice first to invoice the order again.",
  "no customer": "That customer no longer exists. Choose another, or make a new one.",
} as const;

export const orderInvoicesRouter = router({
  // Takes the order's id.
  get: procedure.input(idSchema).query(async ({ ctx, input }) => {
    const found = await getOrderInvoice(ctx.db, input.id);
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "No order has that id" });
    return found;
  }),
  // Takes the invoice's id; null when it was not made from an order.
  order: procedure
    .input(createSelectSchema(documents).pick({ id: true }))
    .query(({ ctx, input }) => getInvoiceOrder(ctx.db, input.id)),
  invoice: procedure.input(invoiceOrderSchema).mutation(async ({ ctx, input }) => {
    const result = await invoiceOrder(ctx.db, input);
    if (result === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No order has that id" });
    }
    if (typeof result === "string") {
      throw new TRPCError({ code: "CONFLICT", message: refusals[result] });
    }
    return result;
  }),
});
