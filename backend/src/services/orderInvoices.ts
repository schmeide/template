import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { catalogOrderLines, catalogOrders } from "../db/schema/catalog.ts";
import { customers } from "../db/schema/customers.ts";
import { documents } from "../db/schema/documents.ts";
import { orderInvoices, type InvoiceOrder } from "../db/schema/orderInvoices.ts";
import { reference as orderReference } from "./catalog.ts";
import { createCustomer, getCustomer } from "./customers.ts";
import {
  currentDate,
  insertDocument,
  reference as documentReference,
  type Document,
  type Tx,
} from "./documents.ts";

// The invoice is due this many days after it is made, as in the invoice editor.
const paymentDays = 30;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// What invoicing can be refused for, besides a missing order (undefined).
export type Refusal = "not fulfilled" | "already invoiced" | "no customer";

// The order's invoice that is not void, if it has one.
const liveInvoice = async (db: Db | Tx, orderId: number) => {
  const [row] = await db
    .select({ document: documents })
    .from(orderInvoices)
    .innerJoin(documents, eq(documents.id, orderInvoices.documentId))
    .where(and(eq(orderInvoices.orderId, orderId), ne(documents.status, "void")));
  return row?.document;
};

// The order's invoice that is not void, and the customer whose email matches the order's, for
// staff to confirm. Undefined when there is no such order.
export const getOrderInvoice = async (db: Db, orderId: number) => {
  const [order] = await db.select().from(catalogOrders).where(eq(catalogOrders.id, orderId));
  if (!order) return undefined;
  const invoice = await liveInvoice(db, orderId);
  const [match] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(${customers.email}) = lower(${order.email})`)
    .orderBy(asc(customers.id))
    .limit(1);
  return {
    invoice: invoice
      ? { id: invoice.id, reference: documentReference(invoice.type, invoice.number) }
      : null,
    customerId: match?.id ?? null,
  };
};

// The order an invoice was made from, or null.
export const getInvoiceOrder = async (db: Db, documentId: number) => {
  const [row] = await db
    .select({ id: catalogOrders.id, number: catalogOrders.number })
    .from(orderInvoices)
    .innerJoin(catalogOrders, eq(catalogOrders.id, orderInvoices.orderId))
    .where(eq(orderInvoices.documentId, documentId));
  return row ? { id: row.id, reference: orderReference(row.number) } : null;
};

// Makes a draft invoice from a fulfilled order, one line per order line, for the chosen customer
// or a new one made from the order's details, and links the two.
export const invoiceOrder = (
  db: Db,
  { orderId, customerId }: Readonly<InvoiceOrder>,
  today = currentDate()
): Promise<Document | Refusal | undefined> =>
  db.transaction(async (tx) => {
    // The row lock makes a second invoicing of the order wait, then find the first invoice.
    const [order] = await tx
      .select()
      .from(catalogOrders)
      .where(eq(catalogOrders.id, orderId))
      .for("update");
    if (!order) return undefined;
    if (order.status !== "fulfilled") return "not fulfilled";
    if (await liveInvoice(tx, orderId)) return "already invoiced";
    const customer =
      customerId === undefined
        ? await createCustomer(tx, {
            name: order.name,
            email: order.email,
            phone: order.phone,
            address: order.address,
          })
        : await getCustomer(tx, customerId);
    if (!customer) return "no customer";
    const lines = await tx
      .select({
        description: catalogOrderLines.name,
        quantity: sql<number>`${catalogOrderLines.quantity} * 1000`.mapWith(Number),
        unitPrice: catalogOrderLines.unitPrice,
        taxRate: catalogOrderLines.taxRate,
      })
      .from(catalogOrderLines)
      .where(eq(catalogOrderLines.orderId, orderId))
      .orderBy(asc(catalogOrderLines.position));
    const invoice = await insertDocument(tx, "invoice", {
      customerId: customer.id,
      issueDate: today,
      dueDate: addDays(today, paymentDays),
      currency: order.currency,
      lines,
    });
    await tx.insert(orderInvoices).values({ orderId, documentId: invoice.id });
    return invoice;
  });
