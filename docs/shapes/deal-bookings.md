# Deal to bookings

A link shape: it books visits for a deal. It requires [deals](deals.md) and [bookings](bookings.md) and has no page
of its own. Its views appear on the deal and booking pages through the slots those shapes expose.

## What it has

- **The link** (`deal_bookings` table): one row per visit, with `booking_id` as its primary key, referencing
  `scheduler_bookings`, and `item_id` referencing `pipeline_items`.
- **Book a visit**: on a deal with a contact. Pick a service, a date and a free time on any resource; the booking is
  for the deal's contact.
- **Visits on the deal**: each with its day and time on the resource's clock, the service, the resource and the
  status, linking to the booking page.
- **The deal on the booking**: a booking made as a visit shows "A visit for the deal" and links to it.

## Rules

- Booking goes through the bookings shape's `createBooking`, so its resource lock and slot check still prevent double
  booking. The visit is booked and linked in one transaction: a taken slot leaves no booking and no link.
- A booking belongs to at most one deal, held by the primary key on `booking_id`. A deal has any number of visits.
- A deal with no contact cannot book a visit, since a booking needs a customer.
- Moving or cancelling the booking, on its own page, keeps the link; the deal shows the visit as it now stands.

## What usually varies

- The names, when deals and bookings are renamed (jobs and visits, say): `frontend/src/visits/Visits.tsx` and the
  messages in `backend/src/routers/visits.ts`.
- Who the visit is for: the deal's contact, read in `bookVisit` in `backend/src/services/visits.ts`.

## Limits

- A booking made on the bookings pages is not linked to a deal afterward; book it from the deal instead.
- Changing a deal's contact does not change the customer on visits already booked.
