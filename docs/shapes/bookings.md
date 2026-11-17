# Bookings

A scheduler: things booked into time slots against a resource (a person, a room, a piece of equipment). This shape
ships it as appointment booking with a public booking page. Class and event registration, staff shifts, job dispatch,
equipment and room rental, and reservations are the same shape with different names, fields and capacities.

## What it has

- **Resources** (`scheduler_resources`, `#/bookings/settings`): a name, a kind (stylist, room) and an IANA time zone.
  Hours and the calendar follow that zone.
- **Services** (`scheduler_services`, same view): a name, a length in minutes, minutes kept free after each booking
  (the buffer), and places. A service with more than one place is a class: that many bookings share one slot. Any
  resource can take any service.
- **Hours** (`#/bookings/hours`): weekly hours per resource (`scheduler_availability`: weekday, from, until, in the
  resource's zone) and date exceptions (`scheduler_exceptions`). An exception replaces that date's weekly hours:
  with no times it closes the day, with times it sets one-off hours.
- **Bookings** (`scheduler_bookings`): resource, service, customer, start and end as `timestamp with time zone`, and
  a status: booked, confirmed, completed, cancelled or no-show. The customer is from the `customers` shape, which this
  one requires.
- **Calendar** (`#/bookings`): bookings by day or week, each on the day and clock of its resource.
- **New booking** (`#/bookings/new`) and **booking page** (`#/bookings/<id>`): pick a service, a date and a free time;
  change the status, move to another free time or resource, or cancel. A cancelled booking frees its time and cannot
  be brought back.
- **Public page** (`#/book`): a customer picks a service and a free time and gives a name, email and optional phone.
  It calls only `services`, `resources`, `slots` and `book`, which return nothing about other customers. Each public
  booking creates a customer.

## Slots and time

`findSlots` in `backend/src/services/scheduler.ts` turns each day's hours into instants in the resource's zone, using
`backend/src/services/zonedTime.ts` (plain `Intl`, no date library). Slots start every 15 minutes (`step`) from the
opening time and must end by closing time; the buffer may run past it. On a spring-forward day a skipped time moves
on by the gap, and hours that span the change are an hour shorter; on a fall-back day they are an hour longer and the
repeated times are offered twice, shown with the zone's abbreviation (1:30 AM EDT, then 1:30 AM EST). Times are always
shown on the resource's clock, never the browser's.

A slot is free when no live booking overlaps it or its buffer, or when the only overlaps are the same service at the
same start with places left.

## No double booking

Every booking, move and public booking runs in one transaction that locks the resource row (`select … for update`),
checks the requested start against `findSlots`, and inserts. A second request for the same resource waits for the
first and then sees its booking. A move locks only the resource it moves to.

The database also holds the slot by itself: live bookings that start together on a resource take distinct seats
(a unique index on resource, start and seat, ignoring cancelled ones), and a seat cannot exceed the capacity copied
onto the booking. So even without the lock, two bookings cannot share a one-place slot and a class cannot take more
than its places. Overlapping bookings with different starts are kept apart by the lock alone: the constraint for that
is a Postgres exclusion constraint on `tstzrange(starts_at, ends_at)`, which drizzle-kit cannot generate yet.

## What usually varies

- What a resource is (stylist, room, van, court) and the copy that names it.
- Single or group capacity: set places per service; set places to 1 everywhere for one-to-one appointments.
- Whether the public page exists: delete `BookOnline.tsx`, drop its entry from `bookings.shape.json`'s `pages`, run
  `make shape/registries`, and remove the `book` procedure.
- Whether a booking carries a price: add a column to `scheduler_services` (and copy it to the booking if it can
  change), then `make db/generate NAME=add_booking_price`.

## Turning bookings into class registration

1. Rename the copy: "Book online" becomes "Sign up", "service" becomes "class" in `frontend/src/bookings/`.
2. Give each class its places, and set hours that match the class times exactly (Monday 18:00 to 19:00 for a 60-minute
   class), so the only slot is the class itself.
3. Run `make check test build`.

Staff shifts, room rental and dispatch follow the same steps: rename, set places to 1, and drop the public page where
staff assign the work.

## Limits

- Recurring bookings (the same time every week) are not built; book each one.
- No reminders are sent before a booking; that needs email and a job runner.
- Until sign-in exists every procedure is open, as in every shape. The staff ones belong behind sign-in then, and the
  public page should stop showing the staff menu.
- A booking must fit a free slot, so staff cannot book outside the hours or off the 15-minute grid; add an exception
  with one-off hours first.
- Resources and services cannot be deleted once booked. Services are not tied to particular resources.
- Hours do not cross midnight; split a night shift into two days' hours.
- The calendar is an agenda list, not a time grid, and loads a week at a time without paging.
