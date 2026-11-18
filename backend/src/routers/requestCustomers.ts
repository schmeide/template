import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { approvalRequests } from "../db/schema/approval.ts";
import { customers } from "../db/schema/customers.ts";
import { convertToCustomerSchema } from "../db/schema/requestCustomers.ts";
import { convertToCustomer, getForRequest, listForCustomer } from "../services/requestCustomers.ts";
import { procedure, router } from "../trpc.ts";

export const requestCustomersRouter = router({
  forRequest: procedure
    .input(createSelectSchema(approvalRequests).pick({ id: true }))
    .query(({ ctx, input }) => getForRequest(ctx.db, input.id)),
  forCustomer: procedure
    .input(createSelectSchema(customers).pick({ id: true }))
    .query(({ ctx, input }) => listForCustomer(ctx.db, input.id)),
  convert: procedure.input(convertToCustomerSchema).mutation(async ({ ctx, input }) => {
    const result = await convertToCustomer(ctx.db, input);
    if (result === "not found") {
      throw new TRPCError({ code: "NOT_FOUND", message: "No request or customer has that id" });
    }
    if (result === "not approved") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only an approved request can be added to customers",
      });
    }
    if (result === "linked") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This request is already linked to a customer",
      });
    }
    return result;
  }),
});
