import { TRPCError } from "@trpc/server";
import {
  checkoutSchema,
  idSchema,
  orderFilterSchema,
  productFilterSchema,
  productSchema,
  productUpdateSchema,
  statusChangeSchema,
  tokenSchema,
} from "../db/schema/catalog.ts";
import {
  createProduct,
  currency,
  getOrder,
  getPublicOrder,
  getShopProduct,
  listOrders,
  listProducts,
  placeOrder,
  setOrderStatus,
  shop,
  updateProduct,
} from "../services/catalog.ts";
import { takePublicSlot } from "../services/rateLimit.ts";
import { procedure, router } from "../trpc.ts";

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const refusals = {
  unavailable:
    "Something in your cart is no longer for sale. Remove it from the cart and place the order again.",
  "not allowed":
    "The order cannot move to that status from where it is. Reload it to see where it stands.",
} as const;

const accepted = <T extends object>(
  value: T | keyof typeof refusals | undefined,
  message: string
): T => {
  if (typeof value === "string") {
    throw new TRPCError({ code: "CONFLICT", message: refusals[value] });
  }
  return found(value, message);
};

// `shop`, `product`, `checkout` and `publicOrder` serve the public shop: only active products,
// and nothing about other orders.
// ponytail: until sign-in exists every procedure is open and every visitor is trusted staff; keep
// the staff ones for signed-in staff once platform sign-in exists (schmeide/schmeide.app#84).
export const ordersRouter = router({
  shop: procedure.input(productFilterSchema).query(({ ctx, input }) => shop(ctx.db, input)),
  product: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      found(await getShopProduct(ctx.db, input.id), "That product is not for sale")
    ),
  checkout: procedure.input(checkoutSchema).mutation(async ({ ctx, input }) => {
    if (!takePublicSlot(`orders ${ctx.ip ?? "unknown"}`)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many orders sent from here. Wait ten minutes and place it again.",
      });
    }
    return accepted(await placeOrder(ctx.db, input), "Nothing was ordered");
  }),
  publicOrder: procedure
    .input(tokenSchema)
    .query(async ({ ctx, input }) =>
      found(await getPublicOrder(ctx.db, input.token), "No order has that link")
    ),

  products: procedure
    .input(productFilterSchema)
    .query(async ({ ctx, input }) => ({ currency, products: await listProducts(ctx.db, input) })),
  createProduct: procedure
    .input(productSchema)
    .mutation(({ ctx, input }) => createProduct(ctx.db, input)),
  updateProduct: procedure
    .input(productUpdateSchema)
    .mutation(async ({ ctx, input }) =>
      found(await updateProduct(ctx.db, input), "No product has that id")
    ),

  list: procedure.input(orderFilterSchema).query(({ ctx, input }) => listOrders(ctx.db, input)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      found(await getOrder(ctx.db, input.id), "No order has that id")
    ),
  setStatus: procedure
    .input(statusChangeSchema)
    .mutation(async ({ ctx, input }) =>
      accepted(await setOrderStatus(ctx.db, input.id, input.to), "No order has that id")
    ),
});
