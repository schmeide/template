import { createSelectSchema } from "drizzle-zod";
import { documents } from "../db/schema/documents.ts";
import { leases } from "../db/schema/leases.ts";
import { billRentSchema } from "../db/schema/rentCharges.ts";
import { reference } from "../services/documents.ts";
import { billRent, chargeForInvoice, chargesForLease } from "../services/rentCharges.ts";
import { procedure, router } from "../trpc.ts";

export const rentChargesRouter = router({
  // Takes a lease's id.
  forLease: procedure
    .input(createSelectSchema(leases).pick({ id: true }))
    .query(({ ctx, input }) => chargesForLease(ctx.db, input.id)),
  // Takes an invoice's id; null when it was not made from a lease.
  forInvoice: procedure
    .input(createSelectSchema(documents).pick({ id: true }))
    .query(({ ctx, input }) => chargeForInvoice(ctx.db, input.id)),
  bill: procedure.input(billRentSchema).mutation(async ({ ctx, input }) => {
    const invoices = await billRent(ctx.db, input.upTo);
    return invoices.map(({ id, number }) => ({ id, reference: reference("invoice", number) }));
  }),
});
