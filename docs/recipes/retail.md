# Retail or wholesale

An app for a small shop that sells online or a wholesaler that takes trade orders: a catalog and order desk, stock,
invoices and purchase orders, and sales figures. Made with `make shape/keep RECIPE=retail`
(`shapes/retail.recipe.json`).

## Shapes and the app each becomes

The menu follows this order: Orders (the home page), Shop, Stock, Invoices, Customers and Dashboard. `customers`
comes right after `invoices`, the first shape that requires it.

- **Orders and Shop**, from [orders](../shapes/orders.md), which ships as this. The Shop page is the storefront for a
  retailer. For a wholesaler it is the trade order form: show prices before tax, and say "we will invoice you" at
  checkout. Pick delivery or collection as [What usually varies](../shapes/orders.md#what-usually-varies) describes.
- **Stock**, from [stock](../shapes/stock.md), which ships as inventory. An item is a stocked product, named as in the
  catalog, with "pcs" or the pack size as its unit, the reorder point as its low stock level and the floor left at
  zero.
- **Invoices and purchase orders**, from [invoices](../shapes/invoices.md). Invoices bill wholesale customers on
  account. Add purchase orders to suppliers the way
  [Quotes and invoices together](../shapes/invoices.md#quotes-and-invoices-together) adds quotes:
  `"purchase_order"` in `documentType` with the prefix `PO`, its own counter row, and a Purchase orders page. A
  purchase order moves `draft → sent | void` and `sent → received | void`; add `received` to `documentStatus`. Payments
  stay on invoices only.
- **Customers**, from [customers](../shapes/customers.md): wholesale accounts and suppliers in one list, with the
  fields below.
- **Dashboard**, from [dashboard](../shapes/dashboard.md). It shows sample data until its metrics are pointed at
  orders. Follow [Pointing a metric at another shape](../shapes/dashboard.md#pointing-a-metric-at-another-shape),
  skipping the `requires` step, with every metric read from `catalog_order_lines` joined to `catalog_orders`, leaving
  out cancelled orders:
  - a sale is an order and its day is the UTC date of `catalog_orders.created_at`;
  - revenue is the sum of each line's `unit_price × quantity`, before tax, so the tiles and the breakdown agree;
  - the category is the product's current `category`, through `catalog_order_lines.product_id`, and the category
    filter keeps only the lines in that category; `listCategories` reads `catalog_products`.

  Then delete the sample table and its notice as step 4 there says.

## Links between them

Each link is a shape of its own that requires both sides. Order to stock is built and kept; order to invoice is not
built yet and has an issue. Until it exists, staff type a wholesale order onto an invoice by hand.

- **Order to stock**, from [order-stock](../shapes/order-stock.md): on each product's page in Orders → Products, staff
  list the stock items it uses and how many (one row with quantity 1 for a stocked product; none for a product that
  is not stocked). "Mark fulfilled" on a `ready` order writes one "out" entry per item with the order's reference and
  fulfills the order, all at once, and only once. If any item would go below its floor, nothing is written, the order
  stays `ready` and the message names the item. An order cannot be cancelled once fulfilled, so there is nothing to
  reverse; a return is an "in" entry recorded by hand.
- **Order to invoice** (`orders` and `invoices`, schmeide/template#64): on a fulfilled order, staff pick or create the
  customer (prefilled by matching the order's email), and the link makes a draft invoice with one line per order line
  (name, count times 1000 as the quantity, unit price and tax rate). An order has at most one invoice that is not
  void, enforced by a lock on the order row; voiding the invoice frees the order.

## Vocabulary and fields

- Product, order, stock and invoice keep their names.
- Customers: add a company name, a tax number, a delivery address separate from the billing address, and a kind
  (customer or supplier) so purchase orders can pick suppliers only. Add them to `backend/src/db/schema/customers.ts`
  and the `CustomerFields` inputs.
- Products: add a SKU, unique, so staff can search by it and the stock item can carry the same code.
- Set the currency in `backend/src/services/catalog.ts` and `frontend/src/dashboard/format.ts`, and the business
  name, address and email in `frontend/src/invoices/business.ts`.

## Not covered yet

- **Receiving a purchase order into stock**: record each delivered line as an "in" entry with the purchase order's
  number as the reference. A link would need purchase order lines to name a stock item, which they do not (a line is
  free text), and deliveries are often partial or differ from the order, so staff count them in.
- **Stock on the shop**: the shop does not show stock or refuse an order that stock cannot cover. Stock is checked
  when an order is fulfilled, through the order-to-stock link.
- **Online payment and shipping rates**: orders are placed unpaid, as the orders shape says.
- **Trade prices and a trade-only shop**: every visitor sees the same prices, and the shop is public. Prices per
  customer and an order history for each account wait on platform sign-in (schmeide/schmeide.app#84) and the portal
  shape (schmeide/template#10).
- **Orders linked to customers**: an order holds the buyer's details as typed. The order-to-invoice link picks the
  customer when invoicing; nothing else matches them.
- **Variants** (size, color): each variant is a product of its own, with its own stock item.
- **A point of sale** for a counter: the shop is an online order form.
- **Product photos as uploads**: the image is a link until the file upload building block exists
  (schmeide/template#34).
- **Emails** when an order is placed or changes status, or when stock runs low.
