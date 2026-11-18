# Restaurant, cafe or takeaway

An app for a restaurant, a cafe, a takeaway or a caterer: table reservations, a menu for takeaway and pre-orders, and
ingredient and supply stock. Made with `make shape/keep RECIPE=restaurant` (`shapes/restaurant.recipe.json`).

## Shapes and the app each becomes

The menu follows this order: Bookings (the home page), Book online, Customers, Orders, Shop and Stock, renamed as
below. `customers` comes third, right after `bookings`, which requires it.

- **Reservations and Book a table**, from [bookings](../shapes/bookings.md). A resource is a table, named so staff can
  tell its size ("Table 4, window, 4 seats"), with the seats as its kind. A service is a sitting with its length and
  the time to reset the table as its buffer ("Dinner", 120 minutes, 15 minutes). Places stay at 1: in this shape,
  places are separate bookings sharing one slot, as in a class, so they are not covers. The party size is a field on
  the booking (see below). Hours are the opening hours, set on every table. Keep the public page for online booking.
- **Guests**, from [customers](../shapes/customers.md): every online reservation creates one. Rename it as
  [What usually varies](../shapes/customers.md#what-usually-varies) describes.
- **Menu orders and Order online**, from [orders](../shapes/orders.md). Follow
  [Turning it into a menu ordering app](../shapes/orders.md#turning-it-into-a-menu-ordering-app) for takeaway and
  pre-orders: a product is a dish, its category the menu section (Starters, Mains). Taking a dish off the menu is the
  "for sale" switch. The shop shows prices; say "pay on collection" at checkout.
- **Stock**, from [stock](../shapes/stock.md), which ships as inventory: ingredients and supplies. Store weights and
  volumes as grams and milliliters, as [What usually varies](../shapes/stock.md#what-usually-varies) describes, and
  packaging in pieces. Set the low stock level to the reorder point. A weekly count is an adjustment entry.

## Links between them

The link is a shape of its own that requires both sides, and the recipe keeps it. The weekly count still records the
difference between the estimated and the counted balance as an adjustment.

- **Order to stock**, from [order-stock](../shapes/order-stock.md): on each dish's page in Orders → Products, staff
  list the stock items it uses and how much of each per portion (grams of flour, one box), which is the dish recipe
  this needs. Fulfilling a `ready` order writes one "out" entry per item with the order's reference and moves the
  order on, all at once, and only once. With the menu statuses, the step it moves to is `collected`: rename it in
  `fulfillOrder` and in the order page's `order-fulfillment` slot as
  [What usually varies](../shapes/order-stock.md#what-usually-varies) describes. If any item would go below its floor,
  nothing is written; turn on "Allow stock below zero" for ingredients, whose balances are estimates between counts,
  so a short balance never holds up a collection. It covers takeaway and pre-orders only, since dine-in sales are not
  recorded (see below).

## Staff shifts and reservations

Staff shifts are a scheduler too, and a shape cannot be kept twice. One calendar holding both, with tables and
people as resources side by side, does not work with the scheduler as it is: the public page offers every resource
and service, so guests could book a waiter; any resource takes any service, so a shift could land on a table; and a
booking needs a customer, which a shift does not have.

The decision: the scheduler gains a calendar as data, the way documents have a type column, and a shift is hours, not
a booking. Resources get a `calendar` column (`reservations` or `shifts`, defaulting to `reservations`, so the
migration only adds). A member of staff is a resource on the shifts calendar: their weekly hours are their regular
shifts and a date exception is a swap or a day off, which the hours page already records. Shift resources take no
bookings: the public page, `slots`, `book` and staff booking leave them out or refuse them. A Rota view shows every
shift resource's hours for a week. Nothing about customers changes, so a booking keeps its required customer.

This is a change to the `bookings` shape and is not built yet (see below). Until then, keep the rota where it is now.

## Vocabulary and fields

- Booking becomes reservation, resource becomes table, service becomes sitting, customer becomes guest, product
  becomes dish, order stays order. "Book online" becomes "Book a table" and "Shop" becomes "Order online" in
  `bookings.shape.json` and `orders.shape.json` (then `make shape/registries`).
- Reservations: add the party size (whole number, 1 or more) to `scheduler_bookings`, the public form and the booking
  page, and a note for occasions and requests.
- Guests: add dietary needs and a note for regulars.
- Dishes: add allergens as a set of choices (the 14 major allergens) on `catalog_products`, shown on the shop beside
  each dish, in place of free text in the description.
- Set the currency in `backend/src/services/catalog.ts` and the time zone on each table.

## Not covered yet

- **Staff shifts**: decided above as a calendar column on the scheduler; not built, and no issue yet.
- **Seating by party size**: a service is not tied to a table, so the public page can offer a 2-seat table to a party
  of 6. Staff move a reservation to a fitting table from its page. Combining tables is not modeled.
- **Dine-in orders, a point of sale, a kitchen display and table service**: no shape. The shop is for orders placed
  ahead.
- **Food costing**: the order-to-stock mapping gives the quantities per dish, but stock items carry no cost.
- **Deposits and no-show fees**: no online payment. **Reminders** before a reservation: schmeide/template#30.
- **A waitlist** and walk-ins on the night: a walk-in is a reservation made by staff at the next free time.
- **Purchase orders to suppliers**: this recipe does not keep `invoices`; record deliveries as "in" entries with the
  supplier's delivery note as the reference.
- **Emails** to confirm a reservation or say an order is ready.
