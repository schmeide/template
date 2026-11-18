# Deal to requests

A link shape: checklists, inspections and other requests filed against a deal that already exists. It requires
[deals](deals.md) and [requests](requests.md) and has no page of its own. Its views appear on the deal and request
pages through the `deal` and `request` slots those shapes expose.

This is not [request-deal](request-deal.md), which makes a new deal from one approved request. Both can be kept
together.

## What it has

- **The link** (`deal_requests` table): one row per request, with `request_id` as its primary key and `item_id`
  referencing the deal in `pipeline_items`.
- **New checklist**: on a deal. It asks for a request type and the person acting, makes an empty draft of that type
  filed by that person, links it to the deal and opens it, acting as the same person, to fill in.
- **The list**: the deal shows its requests, newest first, with type, status and submitted date. Each links to its
  request, and the request shows "Filed for the deal" with a link back.

## Rules

- A request belongs to at most one deal; the primary key on `request_id` enforces it. A deal has any number. Two
  people starting checklists on one deal at once get one request each, each linked once.
- The request is made through the requests shape's `createRequest`, in the same transaction as the link, so a request
  is never left without its link or the other way round. Its statuses, required fields and reviewer rules hold as
  they do for any request; the link adds no other way into `approval_requests`.
- The link never changes a deal's stage or a request's status. A failed inspection does not move the job; that stays
  a person's choice.
- Requests filed through public intake are never linked: only a request made from the deal is. Use
  [request-deal](request-deal.md) to make a new deal from one.

## What usually varies

- The wording, when deals or requests are renamed (jobs, inspections): the heading, button and messages in
  `frontend/src/dealRequests/DealRequests.tsx`, and the refusal in `backend/src/routers/dealRequests.ts`.
- Which types are offered: every request type is, so a project that keeps other types (leave, expenses) may filter
  the list in `DealRequests` to the checklist types.

## Limits

- Only new requests link. An existing request cannot be attached to a deal, and a link cannot be removed.
- With request-deal kept as well, an approved checklist still offers "Make deal", which makes a second, new deal.
