# Request to deal

A link shape: it turns an approved request into a deal. It requires [requests](requests.md), [deals](deals.md) and
[customers](customers.md), and has no page of its own. Its views appear on the request and deal pages through the
slots those shapes expose.

## What it has

- **The link** (`request_deals` table): one row per converted request, with `request_id` as its primary key and
  `item_id` unique, referencing `approval_requests` and `pipeline_items`.
- **Make deal**: on an approved request with no deal yet. It asks for the customer, picked from the list or created
  with a name that starts as the request's contact, then makes a deal in the first stage, titled with the request
  type's name, for that customer. The deal's first note holds the contact and every answered field, one per line.
  Then it opens the deal.
- **Links both ways**: the request shows "Made into deal Callout request" and the deal shows "Made from request
  Callout request #12".

## Rules

- A request converts once. The conversion locks the request row, checks for an existing link, and writes the
  customer, the deal, its note and the link in one transaction; the primary key on `request_id` backs it up. Two
  clicks, or two people, make one deal and at most one new customer.
- Only an approved request converts. Approved is final in the requests shape, so the request's status does not change
  afterward, and changing the deal does not change the request.
- The customer is always a person's choice. A public request's contact is free text, so it is never matched against
  customers' names, emails or phones.
- The deal and the customer are made through the deals and customers services (`insertItem`, `addNote`,
  `createCustomer`), so their own rules, such as the stage lock on a new deal, still hold.

## What usually varies

- The title: the request type's name, in `convertRequest` in `backend/src/services/requestDeals.ts`.
- What goes in the note: `noteFor` in the same file.
- The wording, when deals are renamed (jobs, tickets): `frontend/src/requestDeals/RequestDeal.tsx`.

## Limits

- The new customer gets only a name. Add the email, phone and address on the Customers page afterward.
- A note holds 2000 characters, so very long answers are cut at that length.
- Deleting is not built on either side, so a link stays once made.
