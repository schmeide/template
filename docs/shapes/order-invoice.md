# Order to invoice

A link shape: it invoices a fulfilled order to a customer billed on account, such as a wholesale buyer. It requires
[orders](orders.md), which holds the order, and [invoices](invoices.md), which holds the invoice and its customers. It
has no page of its own. Its views appear on the order page through the orders shape's `order` slot and on the
invoice page through the invoices shape's `invoice` slot.

## What it has

- **The link** (`order_invoices` table): one row per invoice made from an order, with `document_id` as its primary key
  and `order_id` indexed. An invoice belongs to one order; an order may have several, of which at most one is not
  void.
- **Make invoice**, on a fulfilled order with no invoice that is not void. Staff pick the customer: the one whose
  email matches the order's (ignoring case) is picked for them to check, or they choose "New customer", which takes
  the order's name, email, phone and address. An order holds its buyer's details as typed, so nothing is matched
  without staff confirming it. It then creates a draft invoice for that customer, issued today and due in 30 days, in
  the order's currency, with one line per order line: the line's snapshotted name as the description, its count
  times 1000 as the quantity (documents count in thousandths), and its unit price and tax rate. Then it opens the
  invoice.
- **Links both ways**: the order shows "Invoiced as INV-0009" and the invoice shows "Made from order ORD-0012".

## Rules

- **An order has at most one invoice that is not void.** A constraint cannot see the invoice's status, so the
  transaction locks the order row, checks for a linked invoice that is not void, then creates the invoice (through
  the invoices shape's `insertDocument`), any new customer and the link row. Two people invoicing the same order at
  once queue, and the second is refused. The primary key on `document_id` holds each invoice to one order.
- **Voiding the invoice frees the order**, so it can be invoiced again after a mistake.
- **Only a fulfilled order is invoiced.** The invoice is an ordinary draft afterward: editing it does not change the
  order.
- **The totals match.** The invoice's totals come from the `money` shape, like the order's, so an unedited invoice
  totals what the order did.

## What usually varies

- The payment term: `paymentDays` in `backend/src/services/orderInvoices.ts`.
- Which status may be invoiced: the check in `invoiceOrder`, for example to invoice on acceptance instead.
- The wording: `frontend/src/orderInvoices/OrderInvoice.tsx`.

## Limits

- One invoice covers one order. A monthly statement of several orders for one customer is not built.
- "Today", for the issue date, is the server's UTC date, as in the invoices shape.
