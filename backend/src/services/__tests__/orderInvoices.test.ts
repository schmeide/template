import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { catalogOrders } from "../../db/schema/catalog.ts";
import { orderInvoices } from "../../db/schema/orderInvoices.ts";
import { createProduct, getOrder, placeOrder, setOrderStatus } from "../catalog.ts";
import { createCustomer, getCustomer } from "../customers.ts";
import { getDocument, setStatus, updateDocument } from "../documents.ts";
import { getInvoiceOrder, getOrderInvoice, invoiceOrder } from "../orderInvoices.ts";

// Tests share one database, so each makes its own products, orders and customers.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-04-01";

// An order for two products with different tax rates, moved on to `fulfilled` unless `to` says.
const newOrder = async (to: "ready" | "fulfilled" = "fulfilled") => {
  const tea = await createProduct(db, { name: randomUUID(), price: 450, taxRate: 2000 });
  const cake = await createProduct(db, { name: randomUUID(), price: 333, taxRate: 500 });
  const email = `${randomUUID()}@example.com`;
  const placed = await placeOrder(db, {
    name: "Ada Lovelace",
    email,
    phone: "555 0100",
    address: "12 Analytical Row",
    lines: [
      { productId: tea.id, quantity: 3 },
      { productId: cake.id, quantity: 7 },
    ],
  });
  if (typeof placed !== "object") throw new Error(`The order was refused: ${placed}`);
  const [{ id }] = await db
    .select({ id: catalogOrders.id })
    .from(catalogOrders)
    .where(eq(catalogOrders.token, placed.token));
  for (const status of ["accepted", "ready", "fulfilled"] as const) {
    await setOrderStatus(db, id, status);
    if (status === to) break;
  }
  return { id, email, tea, cake };
};

const invoice = async (orderId: number, customerId?: number) => {
  const made = await invoiceOrder(db, { orderId, customerId }, today);
  if (typeof made !== "object") throw new Error(`Invoicing was refused: ${made}`);
  return made;
};

const linksOf = (orderId: number) =>
  db.select().from(orderInvoices).where(eq(orderInvoices.orderId, orderId));

describe("order invoices service", () => {
  it("makes a draft invoice with one line per order line, totaling what the order did", async () => {
    const { id, tea, cake } = await newOrder();
    const customer = await createCustomer(db, { name: randomUUID() });

    const made = await invoice(id, customer.id);

    const document = await getDocument(db, "invoice", made.id, today);
    const order = await getOrder(db, id);
    expect(document).toMatchObject({
      status: "draft",
      customerId: customer.id,
      issueDate: today,
      dueDate: "2026-05-01",
      currency: order?.currency,
      subtotal: order?.subtotal,
      tax: order?.tax,
      total: order?.total,
    });
    expect(document?.lines).toEqual([
      expect.objectContaining({
        description: tea.name,
        quantity: 3000,
        unitPrice: 450,
        taxRate: 2000,
      }),
      expect.objectContaining({
        description: cake.name,
        quantity: 7000,
        unitPrice: 333,
        taxRate: 500,
      }),
    ]);
  });

  it("links the order and the invoice each way", async () => {
    const { id } = await newOrder();
    const made = await invoice(id, (await createCustomer(db, { name: randomUUID() })).id);

    expect(await getOrderInvoice(db, id)).toMatchObject({
      invoice: { id: made.id, reference: expect.stringMatching(/^INV-/) },
    });
    expect(await getInvoiceOrder(db, made.id)).toEqual({
      id,
      reference: (await getOrder(db, id))?.reference,
    });
  });

  it("suggests the customer whose email matches the order's, ignoring case", async () => {
    const { id, email } = await newOrder();
    expect(await getOrderInvoice(db, id)).toEqual({ invoice: null, customerId: null });

    const customer = await createCustomer(db, { name: randomUUID(), email: email.toUpperCase() });

    expect(await getOrderInvoice(db, id)).toEqual({ invoice: null, customerId: customer.id });
    expect(await getOrderInvoice(db, 2_000_000_000)).toBeUndefined();
  });

  it("makes a new customer from the order's details when none is picked", async () => {
    const { id, email } = await newOrder();

    const made = await invoice(id);

    expect(await getCustomer(db, made.customerId)).toMatchObject({
      name: "Ada Lovelace",
      email,
      phone: "555 0100",
      address: "12 Analytical Row",
    });
  });

  it("invoices only a fulfilled order, and refuses a customer that does not exist", async () => {
    const { id } = await newOrder("ready");

    expect(await invoiceOrder(db, { orderId: id }, today)).toBe("not fulfilled");
    expect(await invoiceOrder(db, { orderId: 2_000_000_000 }, today)).toBeUndefined();

    const fulfilled = await newOrder();
    expect(
      await invoiceOrder(db, { orderId: fulfilled.id, customerId: 2_000_000_000 }, today)
    ).toBe("no customer");
    expect(await linksOf(fulfilled.id)).toEqual([]);
  });

  it("keeps an order to one invoice that is not void, and frees it when that is voided", async () => {
    const { id } = await newOrder();
    const first = await invoice(id);

    expect(await invoiceOrder(db, { orderId: id }, today)).toBe("already invoiced");

    await setStatus(db, "invoice", first.id, "void");
    const second = await invoice(id);

    expect(second.id).not.toBe(first.id);
    expect((await getOrderInvoice(db, id))?.invoice?.id).toBe(second.id);
    expect(await getInvoiceOrder(db, first.id)).toMatchObject({ id });
  });

  it("makes one invoice when two people invoice the same order at once", async () => {
    const { id } = await newOrder();
    const customer = await createCustomer(db, { name: randomUUID() });

    const results = await Promise.all([
      invoiceOrder(db, { orderId: id, customerId: customer.id }, today),
      invoiceOrder(db, { orderId: id, customerId: customer.id }, today),
    ]);

    expect(results.filter((result) => result === "already invoiced")).toHaveLength(1);
    expect(await linksOf(id)).toHaveLength(1);
  });

  it("leaves the order alone when the invoice is edited", async () => {
    const { id } = await newOrder();
    const made = await invoice(id);
    const before = await getOrder(db, id);

    await updateDocument(db, "invoice", {
      ...made,
      lines: [{ description: "Changed", quantity: 1000, unitPrice: 1, taxRate: 0 }],
    });

    expect(await getOrder(db, id)).toEqual(before);
  });
});
