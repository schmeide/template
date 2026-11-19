# Club or nonprofit

An app for a sports or social club, a community group or a small charity: a members list, events with sign-up, dues
and donations, and forms for joining and for expense claims. Made with `make shape/keep RECIPE=club`
(`shapes/club.recipe.json`).

## Shapes and the app each becomes

The menu follows this order: Members (the home page), People, Events, Sign up, Dues and Forms, renamed as below, with
Donations after Dues once it is added.

- **Members**, the home page, from [membership](../shapes/membership.md): set up the club's levels (Adult, Junior,
  Family, Life) on the page, then join each member at their level. Status (current, due for renewal, lapsed) comes
  from their periods' dates; see [Membership](#membership) below.
- **People**, from [customers](../shapes/customers.md): everyone the club knows, members or not. Rename the page as
  [What usually varies](../shapes/customers.md#what-usually-varies) describes. Donors and people who sign up for an
  event live here too, with no membership period.
- **Events and Sign up**, from [bookings](../shapes/bookings.md). Follow
  [Turning bookings into class registration](../shapes/bookings.md#turning-bookings-into-class-registration): a
  resource is a venue (the clubhouse, a pitch, the hall), a service is an event or a regular session with its length
  and its places. A one-off event gets no weekly hours, only a date exception whose one-off hours match the event
  exactly. Keep the public page as Sign up.
- **Dues and donations**, from [invoices](../shapes/invoices.md). Dues stay invoices: rename the page to Dues and the
  prefix to `DUE`. For donations follow the pattern in
  [Quotes and invoices together](../shapes/invoices.md#quotes-and-invoices-together): add `"donation"` to
  `documentType` with the prefix `GIFT`, and a Donations router and page that pass `type: "donation"`. A gift is
  recorded after it arrives: a draft with one line for the amount at a tax rate of 0, marked sent, then paid in full.
  The paid donation's print view is the donor's receipt, and searching the Donations list by name is a donor's giving
  history.
- **Forms**, from [requests](../shapes/requests.md). Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app) with two
  types: "Membership application" (Name, Email, Phone and Address as text, the level as a choice, and how they heard
  of the club) with public intake on and the membership secretary as approver, and "Expense claim" (amount, date, what
  for) with the treasurer as approver.

### Why not orders for donations

The issue proposed `orders` for donations, as its doc's [Donations](../shapes/orders.md#donations) section describes.
It is left out. Without online payment its public page takes only pledges, which staff then chase by hand; its orders
keep the donor's details on the order, so a giving history per member needs a link to `customers`; and it has no
receipt. Donations as documents are addressed to a member from the start and print as a receipt. Once online payment
exists, the orders shape becomes the way to give online (see below).

## Links between them

The ones not built yet each have an issue. Until they exist, staff carry the details across by hand.

- **Membership application to member** (`requests` and `customers`, schmeide/template#62): an approved application
  becomes a member, once, enforced by a unique request id in a link table and a lock on the request row. Staff check
  the details filled from the answers named Name, Email, Phone and Address, or pick an existing member; the typed
  email is never matched on its own.
- **Event sign-up to member**: built into `bookings`, which already requires `customers`. Every public sign-up
  creates a new person; staff use "Change customer" on the booking page to move the sign-up onto the existing member,
  as [Changing a booking's customer](../shapes/bookings.md#changing-a-bookings-customer) describes. The extra
  record stays. Matching sign-ups to members by email waits for sign-in or email confirmation.
- **Donation to member**: none needed. A donation is a document addressed to the member or donor.

## Membership

The [membership](../shapes/membership.md) shape holds it: levels with a fee and a length, and one dated period per
year a member pays for, with current, due for renewal and lapsed worked out from the dates. Give Life a level with no
length. "Renew" on a member adds the next period, from the day after the current one ends, or from today once it has
lapsed.

Billing a period's dues onto an invoice is a link not built yet (schmeide/template#61). Until then, renewing is: add
the period, then make a dues invoice by hand at the fee the period shows.

## Vocabulary and fields

- Customer becomes person, resource becomes venue, service becomes event or session, "Book online" becomes "Sign up",
  invoice becomes dues, "Requests" becomes "Forms" in `requests.shape.json` and the copy in `frontend/src/requests/`.
- Events: add a price to services when events are paid for, as
  [What usually varies](../shapes/bookings.md#what-usually-varies) describes.
- Set the club's name, address, email and, for a charity, its registration number in
  `frontend/src/invoices/business.ts`, so receipts carry it.

## Personal details and sign-in

Until platform sign-in exists (schmeide/schmeide.app#84), every staff view is open to anyone who finds the app's
address. A club must not record children's details beyond a name and level, medical notes, or safeguarding records in
member fields or forms before then.

## Not covered yet

- **Online payment** for dues, event tickets and gifts. Once it exists, the orders shape's
  [Donations](../shapes/orders.md#donations) is the way to give online, with a link from orders to `customers`.
- **Recurring dues and giving** (a monthly direct debit): needs online payment and a job runner.
- **Events tied to their dates**: services are not tied to resources or dates, so with two events open on the public
  page, each is offered at the other's times too. Keep one one-off event per venue open at a time.
- **Tax receipts that meet a country's rules** (a US written acknowledgment, a UK Gift Aid declaration): the printed
  receipt carries the gift and the charity number only. A Gift Aid declaration could be a form type, but nothing
  connects it to the gifts.
- **A members' area** to see one's own membership, sign-ups and receipts: waits on the portal shape
  (schmeide/template#10) and platform sign-in (schmeide/schmeide.app#84).
- **Reminders** before an event and **renewal reminders**: need email; event reminders are schmeide/template#30.
  **Weekly sessions** booked as a series: schmeide/template#29.
- **A member's history** on their record (sign-ups, dues, gifts): the members page lists none of it.
- **Club rules and a code of conduct**: no recipe keeps `handbook`; adding it gives policies with read tracking.
