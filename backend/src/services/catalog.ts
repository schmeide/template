import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  catalogCounter,
  catalogOrderLines,
  catalogOrders,
  catalogProducts,
  orderStatus,
  type Checkout,
  type NewProduct,
  type Order,
  type OrderStatus,
  type Product,
  type ProductFilter,
  type ProductUpdate,
} from "../db/schema/catalog.ts";
import { lineAmounts, totals } from "./money.ts";

// Every price is in this currency. Edit for the project.
export const currency = "USD";

export const reference = (number: number): string => `ORD-${String(number).padStart(4, "0")}`;

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  new: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

const productConditions = ({ search, category, ids }: ProductFilter) => {
  const query = search?.trim();
  const pattern = query && `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return [
    pattern
      ? or(ilike(catalogProducts.name, pattern), ilike(catalogProducts.description, pattern))
      : undefined,
    category === undefined ? undefined : eq(catalogProducts.category, category),
    ids === undefined ? undefined : inArray(catalogProducts.id, ids),
  ];
};

// ponytail: no paging; page by name and id once a catalog reaches thousands of products.
export const listProducts = (db: Db, filter: Readonly<ProductFilter>): Promise<Product[]> =>
  db
    .select()
    .from(catalogProducts)
    .where(and(...productConditions(filter)))
    .orderBy(asc(catalogProducts.name), asc(catalogProducts.id));

// What a visitor sees: only active products, without staff fields.
const shopColumns = {
  id: catalogProducts.id,
  name: catalogProducts.name,
  description: catalogProducts.description,
  price: catalogProducts.price,
  taxRate: catalogProducts.taxRate,
  imageUrl: catalogProducts.imageUrl,
  category: catalogProducts.category,
};

export const shop = async (db: Db, filter: Readonly<ProductFilter>) => {
  const products = await db
    .select(shopColumns)
    .from(catalogProducts)
    .where(and(eq(catalogProducts.active, true), ...productConditions(filter)))
    .orderBy(asc(catalogProducts.name), asc(catalogProducts.id));
  const categories = await db
    .selectDistinct({ category: catalogProducts.category })
    .from(catalogProducts)
    .where(and(eq(catalogProducts.active, true), ne(catalogProducts.category, "")))
    .orderBy(asc(catalogProducts.category));
  return { currency, categories: categories.map((row) => row.category), products };
};

export const getShopProduct = async (db: Db, id: number) => {
  const [product] = await db
    .select(shopColumns)
    .from(catalogProducts)
    .where(and(eq(catalogProducts.id, id), eq(catalogProducts.active, true)));
  return product && { ...product, currency };
};

export const createProduct = async (db: Db, input: Readonly<NewProduct>): Promise<Product> => {
  const [product] = await db.insert(catalogProducts).values(input).returning();
  return product;
};

export const updateProduct = async (
  db: Db,
  { id, ...input }: Readonly<ProductUpdate>
): Promise<Product | undefined> => {
  const [product] = await db
    .update(catalogProducts)
    .set(input)
    .where(eq(catalogProducts.id, id))
    .returning();
  return product;
};

// Prices the order from the products as they are now, inside the transaction, and copies each
// product's name, price and tax rate onto its line. "unavailable" when a product is missing or
// inactive; nothing is kept then. A filled honeypot gets a token that leads nowhere.
export const placeOrder = async (
  db: Db,
  { lines, website, ...details }: Readonly<Checkout>
): Promise<{ readonly token: string } | "unavailable"> => {
  if (website) return { token: randomUUID() };
  return db.transaction(async (tx) => {
    const ids = lines.map((line) => line.productId);
    const products = await tx
      .select()
      .from(catalogProducts)
      .where(and(inArray(catalogProducts.id, ids), eq(catalogProducts.active, true)));
    const byId = new Map(products.map((product) => [product.id, product]));
    const priced = lines.flatMap(({ productId, quantity }, position) => {
      const product = byId.get(productId);
      return product
        ? [
            {
              position,
              productId,
              quantity,
              name: product.name,
              unitPrice: product.price,
              taxRate: product.taxRate,
            },
          ]
        : [];
    });
    if (priced.length !== lines.length) return "unavailable";
    // The upsert locks the counter row until commit, so concurrent orders queue for the next number.
    const [{ lastNumber }] = await tx
      .insert(catalogCounter)
      .values({ id: 1, lastNumber: 1 })
      .onConflictDoUpdate({
        target: catalogCounter.id,
        set: { lastNumber: sql`${catalogCounter.lastNumber} + 1` },
      })
      .returning();
    const [order] = await tx
      .insert(catalogOrders)
      .values({ ...details, number: lastNumber, currency, ...totals(priced.map(amounts)) })
      .returning();
    await tx
      .insert(catalogOrderLines)
      .values(priced.map((line) => ({ ...line, orderId: order.id })));
    return { token: order.token };
  });
};

// Order lines count whole items; the money code counts thousandths.
const amounts = (line: {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
}) => ({ quantity: line.quantity * 1000, unitPrice: line.unitPrice, taxRate: line.taxRate });

const linesOf = async (db: Db, orderId: number) => {
  const lines = await db
    .select()
    .from(catalogOrderLines)
    .where(eq(catalogOrderLines.orderId, orderId))
    .orderBy(asc(catalogOrderLines.position));
  return lines.map((line) => ({ ...line, amount: lineAmounts(amounts(line)).net }));
};

export const getOrder = async (db: Db, id: number) => {
  const [order] = await db.select().from(catalogOrders).where(eq(catalogOrders.id, id));
  if (!order) return undefined;
  return { ...order, reference: reference(order.number), lines: await linesOf(db, order.id) };
};

// The customer's view: their order's reference, status, lines and totals, and nothing that
// identifies rows or other orders.
export const getPublicOrder = async (db: Db, token: string) => {
  const [order] = await db.select().from(catalogOrders).where(eq(catalogOrders.token, token));
  if (!order) return undefined;
  const lines = await linesOf(db, order.id);
  return {
    reference: reference(order.number),
    status: order.status,
    createdAt: order.createdAt,
    currency: order.currency,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    lines: lines.map(({ name, quantity, unitPrice, taxRate, amount }) => ({
      name,
      quantity,
      unitPrice,
      taxRate,
      amount,
    })),
  };
};

// ponytail: no paging; page by id once the list reaches thousands.
export const listOrders = async (db: Db, { status }: { readonly status?: OrderStatus }) => {
  const rows = await db
    .select()
    .from(catalogOrders)
    .where(status && eq(catalogOrders.status, status))
    .orderBy(desc(catalogOrders.id));
  return rows.map((order) => ({ ...order, reference: reference(order.number) }));
};

// Moves an order on if `to` is allowed from where it stands now. The update names the statuses it
// may move from, so of two staff acting at once the second matches nothing and is refused.
export const setOrderStatus = async (
  db: Db,
  id: number,
  to: OrderStatus
): Promise<Order | "not allowed" | undefined> => {
  const from = orderStatus.enumValues.filter((status) => transitions[status].includes(to));
  const [order] =
    from.length === 0
      ? []
      : await db
          .update(catalogOrders)
          .set({ status: to })
          .where(and(eq(catalogOrders.id, id), inArray(catalogOrders.status, from)))
          .returning();
  if (order) return order;
  const [exists] = await db
    .select({ id: catalogOrders.id })
    .from(catalogOrders)
    .where(eq(catalogOrders.id, id));
  return exists ? "not allowed" : undefined;
};
