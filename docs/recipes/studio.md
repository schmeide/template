# Studio, clinic or salon

An app for a hair or beauty salon, a yoga or dance studio, a physiotherapy or massage clinic: online booking, client
records and intake forms. Made with `make shape/keep RECIPE=studio` (`shapes/studio.recipe.json`).

## Shapes and the app each becomes

The menu follows this order: Bookings (the home page), Book online, Customers, Requests and Intake forms, renamed as
below.

- **Calendar and Book online**, from [bookings](../shapes/bookings.md), which ships as exactly this. A resource is a
  stylist, a therapist or a room; a service is a treatment with its length and its clean-up time as the buffer. A
  studio that runs classes follows
  [Turning bookings into class registration](../shapes/bookings.md#turning-bookings-into-class-registration) for those
  services and keeps one-to-one services at 1 place.
- **Clients**, from [customers](../shapes/customers.md): rename to clients, or patients for a clinic, as
  [What usually varies](../shapes/customers.md#what-usually-varies) describes, and add the fields below. Every booking
  from the public page creates a client.
- **Forms**, from [requests](../shapes/requests.md). Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app): replace
  Leave with "New client form" (contact preferences, how they heard of you, consent as pass or fail) and, for a
  salon, "Patch test" (pass or fail with a note). Turn on public intake for the new client form. Name the owner or
  manager as the approver: staff review a form instead of approving leave.

## Links between them

The link is a shape of its own that requires both sides, and this recipe keeps it. The public form still works for
people who are not clients yet; staff match it to a client by the contact it gives.

- **Intake form for a client**, built: [customer-intake](../shapes/customer-intake.md). "Send intake form" on a
  client's record makes a one-time link to a form; the answers are filed as a submitted request linked to that client
  and listed on the record. A link is used once, enforced by locking its row as the request is filed. The form shows
  nothing about the client, and has the public form's honeypot and rate limit. Rename its wording with the clients, in
  `frontend/src/intakes/`.

## Vocabulary and fields

- Customer becomes client (or patient), resource becomes stylist or therapist, service becomes treatment or class,
  "Requests" becomes "Forms" in `requests.shape.json` and the copy in `frontend/src/requests/`.
- Clients: add a date of birth and an emergency contact for a clinic; preferred stylist for a salon.
- Services: add a price, as [What usually varies](../shapes/bookings.md#what-usually-varies) describes, so the
  booking page shows it.

## Health details and sign-in

Until platform sign-in exists (schmeide/schmeide.app#84), every staff view is open to anyone who finds the app's
address. A clinic must not collect health details (conditions, medication, treatment notes) in forms or client
fields before then. That includes intake forms: a one-time link keeps the client's name off the form, but the answers
land in requests that every staff view shows, so ask only for contact preferences, how they heard of you and consent.
Everything else in this recipe can run now.

## Not covered yet

- **Memberships and class packs** (a monthly membership, ten classes paid up front): no shape. Credits used per class
  are a ledger, so a later recipe could keep `stock` as a credit balance with a booking-to-ledger link, but billing
  the membership needs recurring payments, which do not exist.
- **Payments and deposits** at booking: no online payment.
- **Reminders** before an appointment: schmeide/template#30. **Repeat appointments**: schmeide/template#29.
- **Treatment notes** per visit, and a client's visit history on their record: a booking has no notes, and the
  clients page does not list bookings. Both are changes to the `bookings` shape, which already requires `customers`.
- **Selling products** at the counter: the `orders` shape is a separate shop, not a point of sale.
- **A client portal** to see and change one's own bookings: waits on the portal shape (schmeide/template#10).
