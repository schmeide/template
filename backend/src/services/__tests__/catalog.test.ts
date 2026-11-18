import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Checkout, NewProduct, OrderStatus } from "../../db/schema/catalog.ts";
import {
  createProduct,
  getOrder,
  getPublicOrder,
  listOrders,
  listProducts,
  placeOrder,
  setOrderStatus,
  shop,
  updateProduct,
} from "../catalog.ts";

// Tests share one database, so each makes its own products and asserts only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newProduct = (fields: Partial<NewProduct> = {}) =>
  createProduct(db, { name: randomUUID(), price: 1250, category: randomUUID(), ...fields });

const details = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  address: "12 Analytical Row",
} as const;

const place = async (lines: Checkout["lines"]) => {
  const placed = await placeOrder(db, { ...details, lines });
  if (typeof placed !== "object") throw new Error(`The order was refused: ${placed}`);
  return placed;
};

const orderFor = async (token: string) => {
  const [order] = (await listOrders(db, {})).filter((row) => row.token === token);
  return order;
};

describe("catalog service", () => {
  describe("products", () => {
    it("shows only active products in the shop, searched and filtered in SQL", async () => {
      const category = randomUUID();
      const tea = await newProduct({ name: `Green tea ${randomUUID()}`, category });
      const cake = await newProduct({ name: `Cake ${randomUUID()}`, category });
      const hidden = await newProduct({ name: `Green tea ${randomUUID()}`, category });
      await updateProduct(db, { ...hidden, active: false });

      const inCategory = await shop(db, { category });
      expect(inCategory.products.map((product) => product.id)).toEqual([cake.id, tea.id]);
      expect(inCategory.categories).toContain(category);
      const searched = await shop(db, { category, search: "green" });
      expect(searched.products.map((product) => product.id)).toEqual([tea.id]);
      expect(Object.keys(searched.products[0]).sort()).toEqual(
        ["category", "description", "id", "imageUrl", "name", "price", "taxRate"].sort()
      );
      const staff = await listProducts(db, { category });
      expect(staff.map((product) => product.id).sort()).toEqual(
        [tea.id, cake.id, hidden.id].sort()
      );
    });

    it("leaves a category out of the shop once none of its products is active", async () => {
      const product = await newProduct();
      await updateProduct(db, { ...product, active: false });

      expect((await shop(db, {})).categories).not.toContain(product.category);
    });

    it("looks up the cart's products by id", async () => {
      const first = await newProduct();
      const second = await newProduct();

      const found = await shop(db, { ids: [second.id, first.id, -1] });

      expect(found.products.map((product) => product.id).sort()).toEqual(
        [first.id, second.id].sort()
      );
    });

    it("treats % and _ in a search as plain text", async () => {
      const category = randomUUID();
      await newProduct({ category, name: "Plain" });
      const percent = await newProduct({ category, name: "100% cotton" });

      const found = await shop(db, { category, search: "0%" });

      expect(found.products.map((product) => product.id)).toEqual([percent.id]);
    });
  });

  describe("placing an order", () => {
    it("prices the order on the server from current prices and stores the totals", async () => {
      const tea = await newProduct({ price: 450, taxRate: 2000 });
      const cake = await newProduct({ price: 333 });

      const { token } = await place([
        { productId: tea.id, quantity: 2 },
        { productId: cake.id, quantity: 3 },
      ]);

      const order = await getPublicOrder(db, token);
      expect(order).toMatchObject({
        status: "new",
        currency: "USD",
        subtotal: 1899,
        tax: 180,
        total: 2079,
        lines: [
          { name: tea.name, quantity: 2, unitPrice: 450, taxRate: 2000, amount: 900 },
          { name: cake.name, quantity: 3, unitPrice: 333, taxRate: 0, amount: 999 },
        ],
      });
    });

    it("ignores a price or total sent with the order", async () => {
      const product = await newProduct({ price: 5000 });
      const tampered = {
        ...details,
        total: 1,
        lines: [{ productId: product.id, quantity: 1, price: 1, unitPrice: 1, name: "Free" }],
      };

      const placed = await placeOrder(db, tampered as Checkout);

      const token = typeof placed === "object" ? placed.token : "";
      expect(await getPublicOrder(db, token)).toMatchObject({
        total: 5000,
        lines: [{ name: product.name, unitPrice: 5000 }],
      });
    });

    it("keeps the price and name it was placed at when the product changes", async () => {
      const product = await newProduct({ price: 700 });
      const { token } = await place([{ productId: product.id, quantity: 1 }]);

      await updateProduct(db, { ...product, name: "Renamed", price: 9900, active: false });

      expect(await getPublicOrder(db, token)).toMatchObject({
        total: 700,
        lines: [{ name: product.name, unitPrice: 700 }],
      });
    });

    it("refuses an inactive or missing product and keeps nothing", async () => {
      const active = await newProduct();
      const inactive = await newProduct();
      await updateProduct(db, { ...inactive, active: false });
      const name = randomUUID();

      expect(
        await placeOrder(db, {
          ...details,
          name,
          lines: [
            { productId: active.id, quantity: 1 },
            { productId: inactive.id, quantity: 1 },
          ],
        })
      ).toBe("unavailable");
      expect(
        await placeOrder(db, { ...details, name, lines: [{ productId: -1, quantity: 1 }] })
      ).toBe("unavailable");
      expect((await listOrders(db, {})).some((order) => order.name === name)).toBe(false);
    });

    it("keeps nothing when the honeypot is filled, and answers the same way", async () => {
      const product = await newProduct();
      const name = randomUUID();

      const placed = await placeOrder(db, {
        ...details,
        name,
        website: "http://spam.example",
        lines: [{ productId: product.id, quantity: 1 }],
      });

      expect(placed).toMatchObject({ token: expect.any(String) });
      expect((await listOrders(db, {})).some((order) => order.name === name)).toBe(false);
    });

    it("gives every concurrent order its own number", async () => {
      const product = await newProduct();
      await Promise.all(Array.from({ length: 8 }, () => db.execute(sql`select 1`)));

      const placed = await Promise.all(
        Array.from({ length: 8 }, () => place([{ productId: product.id, quantity: 1 }]))
      );

      const orders = await Promise.all(placed.map(({ token }) => orderFor(token)));
      expect(new Set(orders.map((order) => order.number)).size).toBe(8);
    });

    it("shows the customer only their own order, by an unguessable token", async () => {
      const product = await newProduct();
      const { token } = await place([{ productId: product.id, quantity: 1 }]);

      const order = await getPublicOrder(db, token);
      expect(order).toBeDefined();
      expect(order).not.toHaveProperty("id");
      expect(order).not.toHaveProperty("email");
      expect(order?.reference).toMatch(/^ORD-\d{4,}$/);
      expect(await getPublicOrder(db, randomUUID())).toBeUndefined();
    });
  });

  describe("order workflow", () => {
    const newOrder = async () => {
      const product = await newProduct();
      const { token } = await place([{ productId: product.id, quantity: 1 }]);
      return orderFor(token);
    };

    const moveTo = async (path: readonly OrderStatus[]) => {
      const order = await newOrder();
      for (const to of path) {
        const moved = await setOrderStatus(db, order.id, to);
        if (typeof moved !== "object") throw new Error(`Could not move to ${to}`);
      }
      return order;
    };

    const paths: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
      new: [],
      accepted: ["accepted"],
      ready: ["accepted", "ready"],
      fulfilled: ["accepted", "ready", "fulfilled"],
      cancelled: ["cancelled"],
    };

    it.each([
      ["new", "accepted"],
      ["new", "cancelled"],
      ["accepted", "ready"],
      ["accepted", "cancelled"],
      ["ready", "fulfilled"],
      ["ready", "cancelled"],
    ] as const)("moves an order from %s to %s", async (from, to) => {
      const order = await moveTo(paths[from]);

      expect(await setOrderStatus(db, order.id, to)).toMatchObject({ id: order.id, status: to });
    });

    it.each([
      ["new", "ready"],
      ["new", "fulfilled"],
      ["new", "new"],
      ["accepted", "new"],
      ["accepted", "fulfilled"],
      ["ready", "accepted"],
      ["fulfilled", "cancelled"],
      ["fulfilled", "new"],
      ["cancelled", "new"],
      ["cancelled", "accepted"],
    ] as const)("refuses to move an order from %s to %s", async (from, to) => {
      const order = await moveTo(paths[from]);

      expect(await setOrderStatus(db, order.id, to)).toBe("not allowed");
      expect((await getOrder(db, order.id))?.status).toBe(from);
    });

    it("answers undefined for a missing order", async () => {
      expect(await setOrderStatus(db, -1, "accepted")).toBeUndefined();
      expect(await getOrder(db, -1)).toBeUndefined();
    });

    it("lets only one of two staff acting at once change the status", async () => {
      const order = await newOrder();
      await Promise.all(Array.from({ length: 4 }, () => db.execute(sql`select 1`)));

      const results = await Promise.all([
        setOrderStatus(db, order.id, "accepted"),
        setOrderStatus(db, order.id, "accepted"),
        setOrderStatus(db, order.id, "accepted"),
      ]);

      expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
    });

    it("lists orders by status, newest first, with the order's details", async () => {
      const first = await newOrder();
      const second = await newOrder();
      await setOrderStatus(db, second.id, "accepted");

      const fresh = (await listOrders(db, { status: "new" })).map((order) => order.id);
      const accepted = (await listOrders(db, { status: "accepted" })).map((order) => order.id);
      expect(fresh).toContain(first.id);
      expect(fresh).not.toContain(second.id);
      expect(accepted).toContain(second.id);
      expect(await getOrder(db, first.id)).toMatchObject({
        ...details,
        reference: `ORD-${String(first.number).padStart(4, "0")}`,
        lines: [{ quantity: 1, unitPrice: 1250, amount: 1250 }],
      });
    });
  });
});
