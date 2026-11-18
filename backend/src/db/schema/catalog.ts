import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const orderStatus = pgEnum("catalog_order_status", [
  "new",
  "accepted",
  "ready",
  "fulfilled",
  "cancelled",
]);

// Price in minor units (cents), tax rate in basis points (2000 = 20%). A product is deactivated,
// never deleted, so the orders that name it keep their link.
export const catalogProducts = pgTable(
  "catalog_products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 2000 }).notNull().default(""),
    price: integer("price").notNull(),
    taxRate: integer("tax_rate").notNull().default(0),
    // ponytail: a link to an image hosted elsewhere, because there is no file upload yet. Upload the
    // image instead once the shared file upload building block exists (schmeide/template#34).
    imageUrl: varchar("image_url", { length: 2000 }).notNull().default(""),
    // Free text; the shop's category list is the distinct values of active products.
    category: varchar("category", { length: 100 }).notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.category),
    check("catalog_products_price_not_negative", sql`${table.price} >= 0`),
    check("catalog_products_tax_rate_range", sql`${table.taxRate} between 0 and 10000`),
  ]
);

// Customer details live on the order. Totals are worked out on the server when the order is placed
// and stored, so they never change afterwards.
export const catalogOrders = pgTable(
  "catalog_orders",
  {
    id: serial("id").primaryKey(),
    number: integer("number").notNull().unique(),
    status: orderStatus("status").notNull().default("new"),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    address: varchar("address", { length: 1000 }).notNull(),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    currency: char("currency", { length: 3 }).notNull(),
    subtotal: integer("subtotal").notNull(),
    tax: integer("tax").notNull(),
    total: integer("total").notNull(),
    // The customer's link to their order. A random UUID is unguessable (122 random bits).
    token: uuid("token").notNull().unique().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.status)]
);

// The product's name, price and tax rate as they were when the order was placed. Quantity is a
// whole count.
export const catalogOrderLines = pgTable(
  "catalog_order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => catalogOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => catalogProducts.id),
    name: varchar("name", { length: 200 }).notNull(),
    unitPrice: integer("unit_price").notNull(),
    taxRate: integer("tax_rate").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    unique().on(table.orderId, table.position),
    check("catalog_order_lines_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

// The last order number handed out, in one row. Incrementing it inside the placing transaction
// numbers orders without gaps, even when two are placed at once.
export const catalogCounter = pgTable("catalog_counter", {
  id: integer("id").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});

export const productSchema = createInsertSchema(catalogProducts, {
  name: (schema) => schema.trim().min(1, "Enter a name"),
  description: (schema) => schema.trim().optional(),
  price: (schema) => schema.min(0),
  taxRate: (schema) => schema.min(0).max(10_000).optional(),
  // Only web links, so the page never renders a javascript: or data: address.
  imageUrl: (schema) =>
    schema
      .trim()
      .refine((url) => url === "" || /^https?:\/\//i.test(url), "Use an http or https link")
      .optional(),
  category: (schema) => schema.trim().optional(),
}).pick({
  name: true,
  description: true,
  price: true,
  taxRate: true,
  imageUrl: true,
  category: true,
  active: true,
});

export const idSchema = createSelectSchema(catalogProducts).pick({ id: true });
export const productUpdateSchema = productSchema.extend(idSchema.shape);

export const productFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().max(100).optional(),
  ids: z.array(z.number().int()).max(100).optional(),
});

export const maxQuantity = 999;

// Only product ids and counts: the server prices the order. Anything else sent is dropped.
export const checkoutSchema = createInsertSchema(catalogOrders, {
  name: (schema) => schema.trim().min(1, "Enter your name"),
  email: () => z.email("Enter an email address like name@example.com").max(320),
  phone: (schema) => schema.trim().optional(),
  address: (schema) => schema.trim().min(1, "Enter a delivery address"),
  notes: (schema) => schema.trim().optional(),
})
  .pick({ name: true, email: true, phone: true, address: true, notes: true })
  .extend({
    lines: z
      .array(
        z.object({
          productId: z.number().int(),
          quantity: z.number().int().min(1).max(maxQuantity),
        })
      )
      .min(1, "Your cart is empty. Add something before placing the order.")
      .max(100),
    // A honeypot: the checkout form hides it, so only a bot fills it in.
    website: z.string().max(200).optional(),
  });

export const orderFilterSchema = z.object({ status: z.enum(orderStatus.enumValues).optional() });
export const statusChangeSchema = z.object({
  ...createSelectSchema(catalogOrders).pick({ id: true }).shape,
  to: z.enum(orderStatus.enumValues),
});
export const tokenSchema = z.object({ token: z.uuid() });

export type Product = typeof catalogProducts.$inferSelect;
export type Order = typeof catalogOrders.$inferSelect;
export type OrderStatus = Order["status"];
export type NewProduct = z.input<typeof productSchema>;
export type ProductUpdate = z.input<typeof productUpdateSchema>;
export type ProductFilter = z.input<typeof productFilterSchema>;
export type Checkout = z.input<typeof checkoutSchema>;
