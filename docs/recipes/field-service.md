# Field service

An app for a plumber, an electrician, a cleaner or any trade that goes to the customer: callout requests, jobs, a
dispatch calendar, quotes and invoices. Made with `make shape/keep RECIPE=field-service`
(`shapes/field-service.recipe.json`).

## Shapes and the app each becomes

The menu follows this order; `customers` comes second, right after the first shape that requires it.

- **Jobs**, the home page, from [deals](../shapes/deals.md). Follow
  [Turning deals into support tickets](../shapes/deals.md#turning-deals-into-support-tickets) with the stages New,
  Quoted, Scheduled, In progress, Done (closes as won) and Lost (closes as lost), but skip step 3 and keep the value:
  it is the job's expected price. The contact is the customer; the owner is the technician in charge.
- **Customers**, from [customers](../shapes/customers.md), with the fields below.
- **Schedule**, the dispatch calendar, from [bookings](../shapes/bookings.md). Follow the dispatch note under
  [Turning bookings into class registration](../shapes/bookings.md#turning-bookings-into-class-registration): a
  resource is a technician or a van, a service is a job type with its usual length (boiler service, 60 minutes, with
  30 minutes of travel as the buffer), and places stay at 1. Delete the public "Book online" page: staff dispatch the
  work, and customers ask through the callout form instead.
- **Quotes and invoices**, from [invoices](../shapes/invoices.md). Follow
  [Quotes and invoices together](../shapes/invoices.md#quotes-and-invoices-together): one `documents` table with
  `"quote"` added to the document type, the quote statuses and `valid_until` from
  [Turning invoices into quotes](../shapes/invoices.md#turning-invoices-into-quotes), and payments on invoices only.
- **Callouts and checklists**, from [requests](../shapes/requests.md). Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app) with two
  types: "Callout request" (address, problem, urgency as a choice, preferred days) with public intake on, for the
  website, and "Job checklist" (one pass or fail field per safety check), filled in on site.

## Links between them

None of these is built yet. Each is a shape of its own that requires both sides, and each has an issue. Until they
exist, staff carry the details across by hand.

- **Quote to invoice** (`invoices` alone, schmeide/template#38): an accepted quote becomes a draft invoice with a copy
  of its lines, for the same customer. A quote converts once, enforced by a unique quote id in a link table and a lock
  on the quote row. Voiding the invoice does not free the quote.
- **Job to quotes and invoices** (`deals` and `invoices`, schmeide/template#39): from a job, make a quote or invoice for
  its customer and list them on the job. A document belongs to at most one job. A job with no customer gets none.
- **Job to visits** (`deals` and `bookings`, schmeide/template#40): from a job, book one or more visits through the
  bookings service, so the no-double-booking rules still hold. A booking belongs to at most one job; cancelling it
  keeps the link and shows the visit as cancelled.
- **Callout request to job** (`requests` and `deals`, schmeide/template#41): an approved callout becomes a job in the
  first stage, once, with its answers in the job's first note. Staff pick or create the customer, since a public
  request carries only a free-text contact.

## Vocabulary and fields

- Deal becomes job, stage names as above. Booking becomes visit, resource becomes technician, service becomes job
  type. "Requests" becomes "Callouts" in the menu if checklists move elsewhere.
- Customers: add a site address separate from the billing address, and access notes (key safe, parking). Add them to
  `backend/src/db/schema/customers.ts` and the `CustomerFields` inputs.
- Jobs: add a site address when it differs from the customer's, and a priority.
- Set the business name, address and email in `frontend/src/invoices/business.ts`.

## Not covered yet

- **Client portal** (customers see their quotes, invoices and visits, and accept a quote): the portal shape
  (schmeide/template#10) waits on platform sign-in (schmeide/schmeide.app#84). Until then each quote and invoice has its
  share link, which is enough to send one.
- **Accepting a quote online**: the share link is read-only; a staff member records the acceptance.
- **Recurring visits** (a yearly service): schmeide/template#29. **Visit reminders**: schmeide/template#30.
- **Photos and signatures on site**: need the file upload building block (schmeide/template#34); checklists have no
  signature field.
- **Parts used on a job**: no recipe keeps `stock`; adding it as van stock is possible but needs a job-to-stock link
  that has no issue.
- **Routes and travel times** between visits, and a mobile view for technicians.
