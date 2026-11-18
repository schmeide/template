# Orders

A catalog and an order: a public list of things to choose from, a cart, and an order the business then fulfills.
This shape ships it as a simple order form. A storefront, a wholesale order form, menu ordering, a quote request and
donations are the same shape with different names, fields and statuses.

## What it has

- **Products** (`catalog_products` table, Orders page, Products view): name, description, price, tax rate, an image
  link, a category and a "for sale" switch. Products are taken off sale, never deleted, so old orders keep their link.
  A category is free text; the shop's category list is the categories of the products for sale.
- **Shop** (Shop page, no sign-in): browse and search by category (both done in SQL), a product page, a cart and a
  checkout that collects name, email, phone, delivery address and notes. It shows only products for sale and nothing
  about other orders.
- **Cart**: kept in the browser's `localStorage` as product ids and counts only, read through a wrapper so the page
  still works for the visit when storage is blocked. The server never trusts it.
- **Orders** (`catalog_orders`, `catalog_order_lines`): a list filtered by status, a detail view with the customer's
  details, and buttons for the allowed status changes.
- **Money**: from the `money` shape, which this one requires. See [money.md](money.md).
- **Slots**, where link shapes add their views (`<Slots>` from `frontend/src/App.tsx`); with no link kept they render
  nothing or the page's own control:
  - `product`, below the form on a product's edit page;
  - `order-fulfillment`, in place of the "Mark fulfilled" button on a `ready` order, which it renders when no view
    fills the slot.

## Rules

- **Server-side pricing**: checkout sends product ids and counts. Inside one transaction the server reads the products
  as they are now, refuses the order if any is missing or off sale (`CONFLICT`, "Remove it from the cart and place the
  order again"), works out the totals with `totals` from the money shape and stores them on the order. A price, name or
  total sent by the browser is dropped by the input schema. Counts are whole numbers from 1 to 999; an empty cart is
  refused.
- **Price snapshot**: each order line copies the product's name, price and tax rate. Changing or hiding the product
  later leaves the order as it was.
- **Numbering**: `catalog_counter` holds the last order number in one row. Placing an order increments it in the same
  transaction, so numbers run in order with no gaps and concurrent orders wait for each other. Orders read as
  `ORD-0012` (`reference` in `backend/src/services/catalog.ts`).
- **Statuses**: `new → accepted → ready → fulfilled`, and `new`, `accepted` or `ready` can become `cancelled`. Any
  other change is refused. The update names the statuses it may move from, so of two staff acting at once the second
  is refused and told to reload.
- **The customer's link**: after checkout the customer lands on `#/shop/order/<token>`, a random UUID, which shows the
  order's reference, status, lines and totals. It shows no email, phone, address or ids.
- **Abuse protection**: the checkout is a write open to the internet. A hidden `website` field is a honeypot: an order
  with it filled gets a token that leads nowhere and is not kept. Each address may place five orders per ten minutes,
  from the `ratelimit` shape, which this one requires. See [ratelimit.md](ratelimit.md).
- **Payment** is out of scope: orders are placed unpaid ("pay on collection" or "we will invoice you"). The checkout
  says nothing is charged. Online payment waits for the platform's payments answer.
- **The currency** is the constant `currency` in `backend/src/services/catalog.ts`. Edit it for the project.
- **No sample products.** A new project's shop is empty and says so; staff add products in Orders → Products and they
  show straight away. Samples seeded on first read would appear to real customers on a public page.

## What usually varies

- Whether prices show. A quote request hides them: drop the price column from the shop and cart, keep `price` at 0,
  and rename "Place order" to "Request a quote".
- Delivery or collection. For collection, remove the address field (column, `checkoutSchema`, the checkout form and
  the detail view) or relabel it "Collection time".
- The statuses: edit `orderStatus` in the schema, `transitions` in the service and `nextSteps` in
  `frontend/src/orders/format.ts`.
- Whether stock is tracked. That is the [order-stock](order-stock.md) link shape, which requires this one and
  `stock`. Each product names the stock items it uses, and "Mark fulfilled" on a `ready` order records an `out`
  entry per item and refuses, writing nothing, when that would take an item below its floor. The shop does not
  check or show stock.
- Customers. Details live on the order so the shop needs no other shape. When `customers` is kept too, a link shape
  can add `customer_id` to `catalog_orders` and match or create the customer by email on checkout.

## Turning it into a menu ordering app

1. Rename "Delivery address" to "Table or pickup name" in the checkout form and `checkoutSchema` message.
2. Replace the statuses with `new`, `preparing`, `ready`, `collected` and `cancelled`.
3. Rename the page titles in `orders.shape.json` (then `make shape/registries`).
4. Run `make db/generate NAME=menu`, then `make check test build`.

## Donations

Make each product an amount ("Give $10") with a tax rate of 0, rename the cart to "Your gift", and change the
statuses to `pledged`, `received` and `cancelled`. Taking the payment waits for the payments answer.

## Limits

- There is no sign-in, so every visitor to the staff pages is trusted staff. The shop pages call only the public
  procedures, but the staff procedures are open too until the platform supplies sign-in.
- The image is a link to a picture hosted elsewhere, and only `http` and `https` links are accepted. It becomes an
  upload once the shared file upload building block exists (schmeide/template#34).
- Nobody is emailed when an order is placed or changes status; that needs email. The customer checks their link.
- Lists load every matching product or order without paging.
- The cart shows the subtotal at today's prices; the tax and final total come from the server when the order is
  placed.
