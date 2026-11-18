# Order to stock

A link shape: fulfilling an order takes what it used out of stock. It requires [orders](orders.md), which holds the
products and orders, and [stock](stock.md), which holds the items and their entries. It has no page of its own. Its
views appear on the orders shape's pages through two slots: `product` on a product's edit page, and
`order-fulfillment`, which replaces the order page's own "Mark fulfilled" button.

## What it has

- **Stock used** (`order_stock_items` table): one row per product and stock item, with how many units of the item one
  unit of the product takes, in the item's unit. A shop's product has one row with quantity 1; a dish has one row per
  ingredient (grams of flour per pizza). A product with no rows takes nothing from stock. Staff add, change and
  remove them on the product's page in Orders → Products.
- **Issued orders** (`order_stock_issues` table): the orders already taken out of stock, one row each.
- **Mark fulfilled**, on a `ready` order, with a "Fulfilled by" name. In one transaction it writes one `out` entry per
  stock item the order uses, records the order as issued, and moves the order to `fulfilled` with the orders shape's
  `setOrderStatus`. Each entry's quantity is the sum over the order's lines of the line's count times the item's
  quantity, negated; its reference is the order's (`ORD-0012`), its date today (UTC) and its "who" the name given.

## Rules

- **An order is taken out of stock once.** The transaction locks the order row and only a `ready` order goes on;
  the primary key on `order_stock_issues.order_id` backs it up. Two clicks, or two people, write one set of entries.
- **All or nothing.** The transaction locks every stock item the order uses, in id order so two fulfillments that
  share items queue instead of deadlocking, then checks each against its floor. If any would go below its floor,
  nothing is written, the order stays `ready`, and the refusal is a `CONFLICT` naming the item. An item with no floor
  ("Allow stock below zero") never refuses.
- **Mapping changes apply to later fulfillments only.** Entries already written stay as they are.
- **Nothing to reverse on cancel.** An order can only be cancelled before it is fulfilled, so a cancelled order never
  has entries. Goods returned after fulfillment are an `in` entry recorded by hand on the Stock page.
- **The shop does not check or show stock.** Stock is checked when goods leave, at fulfillment.

## What usually varies

- The statuses. Fulfillment goes from `ready` to `fulfilled`; if the orders shape's statuses are renamed (`collected`
  in a menu ordering app), change the status check in `fulfillOrder` in `backend/src/services/orderStock.ts`, and
  the step the order page's `order-fulfillment` slot replaces in `frontend/src/orders/OrderDetail.tsx`.
- The wording: `frontend/src/orderStock/OrderStock.tsx`.

## Limits

- The orders router's `setStatus` can still move a `ready` order to `fulfilled` without taking it out of stock. The
  order page offers only this link's "Mark fulfilled" while the link is kept, and every visitor is trusted staff until
  sign-in exists.
- Stock is not reserved when an order is placed or accepted; two orders may be accepted for the last unit, and the
  second is refused at fulfillment.
- "Who" is free text, as in the stock shape.
