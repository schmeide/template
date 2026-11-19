import { TRPCError } from "@trpc/server";
import { idSchema } from "../db/schema/catalog.ts";
import { fulfillmentSchema, stockItemKeySchema, stockItemSchema } from "../db/schema/orderStock.ts";
import {
  fulfillOrder,
  listStockItems,
  removeStockItem,
  setStockItem,
} from "../services/orderStock.ts";
import { procedure, router } from "../trpc.ts";

export const orderStockRouter = router({
  // Takes the product's id.
  items: procedure.input(idSchema).query(({ ctx, input }) => listStockItems(ctx.db, input.id)),
  setItem: procedure
    .input(stockItemSchema)
    .mutation(({ ctx, input }) => setStockItem(ctx.db, input)),
  removeItem: procedure
    .input(stockItemKeySchema)
    .mutation(({ ctx, input }) => removeStockItem(ctx.db, input)),
  fulfill: procedure.input(fulfillmentSchema).mutation(async ({ ctx, input }) => {
    const result = await fulfillOrder(ctx.db, input);
    if (result === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No order has that id" });
    }
    if (result === "not allowed") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only a ready order is fulfilled. Reload it to see where it stands.",
      });
    }
    if ("short" in result) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Not enough ${result.short} in stock. Record what came in on the Stock page, then fulfill the order again.`,
      });
    }
    return result;
  }),
});
