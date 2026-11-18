# Agency or consultancy

An app for a design or marketing agency, a consultancy or a freelancer: a sales pipeline, projects with tracked time,
proposals and invoices. Made with `make shape/keep RECIPE=agency` (`shapes/agency.recipe.json`).

## Shapes and the app each becomes

The menu follows this order; `customers` comes second, right after the first shape that requires it.

- **Pipeline**, the home page, from [deals](../shapes/deals.md). It stays a sales CRM: rename the stages to Lead,
  Brief, Proposal sent, Negotiation, Won and Lost in `defaultStages`. The value is the deal's fee; the owner is the
  account lead.
- **Clients**, from [customers](../shapes/customers.md): rename it as
  [What usually varies](../shapes/customers.md#what-usually-varies) describes, and add the fields below.
- **Time**, from [stock](../shapes/stock.md). Follow
  [Turning stock into time tracking](../shapes/stock.md#turning-stock-into-time-tracking): an item becomes a project,
  entries are minutes, billable or non-billable, and the low stock level becomes a budget of hours.
- **Proposals and invoices**, from [invoices](../shapes/invoices.md). Follow
  [Quotes and invoices together](../shapes/invoices.md#quotes-and-invoices-together), naming the quote type
  "proposal" (prefix `P`), with the statuses and `valid_until` from
  [Turning invoices into quotes](../shapes/invoices.md#turning-invoices-into-quotes).

### Two boards

An agency often wants a second board for delivery (Briefed, In progress, In review, Delivered) beside the sales
pipeline. A shape cannot be kept twice, so this recipe does not try. A project lives in time tracking as a ledger
account, which carries what most agencies track per project: hours against a budget. A delivery board with its own
stages is not covered (see below); it would be the pipeline shape gaining a board column as data, the way documents
have a type column, not a second copy of the shape.

## Links between them

None of these is built yet. Each is a shape of its own that requires both sides, and each has an issue. Until they
exist, staff carry the details across by hand: they add a project by name and type time onto an invoice as lines.

- **Won deal to project** (`deals` and `stock`, schmeide/template#42): a deal in a stage that closes as won opens one
  ledger account named after it, once, enforced by unique ids on both sides of a link table and a lock on the deal row.
- **Time to invoice** (`stock` and `invoices`, schmeide/template#43): for a project and a date range, the unbilled
  billable entries become lines on a draft invoice for the project's client at its hourly rate. The client and rate
  live in the link's own table. An entry lands on at most one invoice that is not void: billing locks the project's
  account row and writes the invoice and the billed-entry rows in one transaction, and voiding the invoice frees its
  entries. The issue also decides how a reversal of an already billed entry is credited.
- **Deal to proposals and invoices** (`deals` and `invoices`, schmeide/template#39): a proposal is made from the deal
  for its contact and listed on it. A document belongs to at most one deal.
- **Proposal to invoice** (`invoices` alone, schmeide/template#38): an accepted proposal becomes a draft invoice with
  its lines, once. Fixed-fee work is billed this way; hourly work through time.

## Vocabulary and fields

- Deal stays deal, customer becomes client, stock becomes time, item becomes project, quote becomes proposal.
- Clients: add a company name and a tax number (`backend/src/db/schema/customers.ts` and `CustomerFields`).
- Deals: add a service line (a choice such as Brand, Web, Campaign) and an expected start date.
- Time entries: "Who" defaults to the person tracking, as the stock doc's step 5 says.
- Set the business name, address and email in `frontend/src/invoices/business.ts`.

## Not covered yet

- **A delivery board or task list per project**, as described under [Two boards](#two-boards).
- **Retainers** (a monthly invoice for a fixed fee): needs a job runner to make recurring invoices.
- **Rates per person or per role**: the time-to-invoice link has one rate per project.
- **A client portal** for proposals, invoices and progress: the portal shape (schmeide/template#10) waits on platform
  sign-in (schmeide/schmeide.app#84). Share links cover sending a proposal or an invoice.
- **Expenses** recharged to clients: the ledger would have to be kept a second time; record them as invoice lines.
- **Who did the work**: "Who" on a time entry is free text until sign-in exists.
