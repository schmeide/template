# Construction or trades

An app for a builder, a remodeler, a roofer or any trade that runs jobs over weeks: estimate requests, jobs on a
board, estimates, change orders and invoices, job costs, and site inspections. Made with
`make shape/keep RECIPE=construction` (`shapes/construction.recipe.json`).

## Shapes and the app each becomes

The menu follows this order; `customers` comes second, right after the first shape that requires it.

- **Jobs**, the home page, from [deals](../shapes/deals.md). Replace `defaultStages` with Lead, Estimating, Estimate
  sent, Contracted (closes as won), In progress, Final inspection, Complete (closes as won) and Lost (closes as lost).
  Contracted closes as won so the job can open its cost account (see the links below); the stages after it track the
  work. Keep the value: it is the contract value, which staff update when a change order is accepted. The contact is
  the customer; the owner is the project manager.
- **Customers**, from [customers](../shapes/customers.md), with the fields below.
- **Estimates and invoices**, from [invoices](../shapes/invoices.md). Follow
  [Quotes and invoices together](../shapes/invoices.md#quotes-and-invoices-together) twice: add `"estimate"`
  (prefix `E`) and `"change_order"` (prefix `CO`) to `documentType`, each with its own counter row, router and page.
  Both take the statuses and `valid_until` from
  [Turning invoices into quotes](../shapes/invoices.md#turning-invoices-into-quotes); payments stay on invoices only.
  A change order is a document of its own for the work it adds or removes, signed off by the customer accepting it.
- **Job costs**, from [stock](../shapes/stock.md). Follow
  [Turning stock into time tracking](../shapes/stock.md#turning-stock-into-time-tracking) with cents as the unit, as
  its last line says for expenses: an item becomes a job's cost account, and the entry kinds become labor, materials,
  subcontract and equipment. Labor is entered as its cost (hours times the crew rate), so every entry is money. Format
  amounts with `formatMoney` from the `money` shape, which `invoices` keeps. Turn the low stock level into the cost
  budget, and the low stock filter into "at or over budget".
- **Inspections and requests**, from [requests](../shapes/requests.md). Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app) with three
  types: "Estimate request" (site address, scope of work, budget as a choice, preferred start) with public intake on,
  for the website; "Site inspection" and "Punch list", each one pass or fail field per item, filled in on site.

### What changed from the proposal

The issue proposed client change requests as a request type. A change requested by the customer is written up as a
change order instead: the customer accepting it is the approval, and it carries the price. A public form for change
requests would arrive with no job attached and no price. The proposal also had change orders adding to an accepted
estimate through a link of their own; both documents belong to the job (schmeide/template#39), so the job is what
ties them and no second link is needed. `bookings` is left out: it books slots of minutes for one resource, and
crews on site for days or weeks do not fit it (see below).

## Links between them

None of these is built yet. Each is a shape of its own that requires both sides, and each has an issue. Until they
exist, staff carry the details across by hand.

- **Estimate request to job** (`requests` and `deals`, schmeide/template#41): an approved estimate request becomes a
  job in the first stage, once, with its answers in the job's first note. Staff pick or create the customer, since a
  public request carries only a free-text contact.
- **Job to estimates, change orders and invoices** (`deals` and `invoices`, schmeide/template#39): from a job, make an
  estimate, a change order or an invoice for its customer and list them on the job. A document belongs to at most one
  job. A job with no customer gets none. The issue names quotes and invoices; the project adds "New change order"
  beside them.
- **Estimate or change order to invoice** (`invoices` alone, schmeide/template#38): an accepted estimate becomes a
  draft invoice with a copy of its lines, once, and voiding the invoice does not free it. The issue converts quotes;
  in this project its check that the source is a quote becomes a check that it is an accepted estimate or change
  order, so each accepted change order is billed the same way.
- **Job to cost account** (`deals` and `stock`, schmeide/template#42): a job in a stage that closes as won
  (Contracted) opens one cost account named after it, once, enforced by unique ids on both sides of a link table and
  a lock on the job row. Moving the job on to In progress keeps the account and its entries.
- **Inspections on a job** (`deals` and `requests`, schmeide/template#54): from a job, start a site inspection or a
  punch list as a draft request linked to the job, through the `requests` service, and list the job's requests with
  type and status. A request belongs to at most one job; a job has any number. The link never moves the job or
  decides the request. This differs from schmeide/template#41, which makes a new job from one request.

## Vocabulary and fields

- Deal becomes job, stage names as above. Quote becomes estimate. Item becomes cost account, entry becomes cost.
  "Requests" becomes "Inspections" in the menu.
- Customers: add a site address separate from the billing address, and access notes (gate code, parking, working
  hours). Add them to `backend/src/db/schema/customers.ts` and the `CustomerFields` inputs.
- Jobs: add a site address when it differs from the customer's, a permit number, and a start and an end date.
- Estimates and change orders: add a scope of work as text above the lines.
- Set the business name, address, email and license number in `frontend/src/invoices/business.ts`.

## Not covered yet

- **Progress billing and retention** (invoicing a share of the contract value per stage, holding back a percentage
  until completion): no shape. Until then, staff write each progress invoice by hand as a line for the share, and
  track the retention outside the app.
- **Costs against the estimate**: a report comparing a job's cost entries with its accepted estimate and change
  orders needs a metric the dashboard does not have and the dashboard shape, which this recipe does not keep. The
  cost budget on each account is the stand-in.
- **A running contract value** summed from the accepted estimate and change orders: the job's value is updated by
  hand.
- **Cost-plus or time and materials billing**: schmeide/template#43 bills time at an hourly rate, not costs in cents
  with a markup.
- **Crew scheduling** over days and weeks: `bookings` books slots of minutes, so the recipe does not keep it.
- **Photos, drawings and signed change orders**: need the file upload building block (schmeide/template#34).
- **A client portal** for estimates, change orders and invoices: the portal shape (schmeide/template#10) waits on
  platform sign-in (schmeide/schmeide.app#84). Share links cover sending each document.
- **Accepting an estimate or change order online**: the share link is read-only; a staff member records the
  acceptance.
- **Subcontractors and suppliers** as their own records, with purchase orders: no recipe keeps a second contact list.
