import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { customers, customerUpdateSchema, newCustomerSchema } from "../db/schema/customers.ts";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../services/customers.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(customers).pick({ id: true });

const found = <T>(customer: T | undefined): T => {
  if (customer === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No customer has that id" });
  }
  return customer;
};

export const customersRouter = router({
  list: procedure.query(({ ctx }) => listCustomers(ctx.db)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) => found(await getCustomer(ctx.db, input.id))),
  create: procedure
    .input(newCustomerSchema)
    .mutation(({ ctx, input }) => createCustomer(ctx.db, input)),
  update: procedure
    .input(customerUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateCustomer(ctx.db, input))),
});
