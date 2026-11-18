# Requests

Request and approval: someone fills in a form and someone else reviews it and decides. This shape ships it as leave
requests. Expense claims, purchase requests, inspections and checklists, incident reports, maintenance requests and
client intake are the same shape with different request types, fields and approvers.

## What it has

- **People**: the names in the "Acting as" picker at the top of every Requests view. Pick a name or add one. The
  choice is kept in the browser. They come from the `people` shape, which this one requires and shares with
  `handbook`; see [people.md](people.md) and [Who is who](#who-is-who).
- **Request types** (`approval_types`, `#/requests/types`): a name, the fields it asks for, an optional approver and
  an optional public link. A database with no types gets `defaultTypes` from `backend/src/services/approval.ts` the
  first time the types load: Leave, with a kind of leave, a first and a last day, and a note.
- **Fields**: each has a label, a kind and whether it is required. The kinds are text, number, date, choice (with its
  options) and pass or fail (with an optional note). A type made of pass or fail fields is an inspection checklist;
  there is no separate checklist mode.
- **Requests** (`approval_requests`): type, submitter, the fields it answers, the answers, status, created and
  submitted times. New request at `#/requests/new`, your own at `#/requests`, one request with its history at
  `#/requests/<id>`.
- **Review** (`#/requests/review`): submitted requests the person acting may decide.
- **Decisions** (`approval_decisions`): one row for every status change, with who made it, the outcome and an
  optional comment, written in the same transaction as the change. The request page shows them newest first.
- **Public form** (`#/requests/form/<token>`): see [Public intake](#public-intake).

## Statuses

| From                 | To                                       | By                     |
| -------------------- | ---------------------------------------- | ---------------------- |
| draft                | submitted, withdrawn                     | the submitter          |
| returned for changes | submitted, withdrawn                     | the submitter          |
| submitted            | withdrawn                                | the submitter          |
| submitted            | approved, rejected, returned for changes | a reviewer (see below) |

A reviewer is anyone but the submitter, or only the type's approver when it names one. Approved, rejected and
withdrawn are final. `transition` in `backend/src/services/approval.ts` checks every step against this table on the
server, so a stale page cannot skip one. It locks the request row first, so when two reviewers decide at once the
second waits, sees the first decision and is refused. The submitter edits answers only while the request is a draft
or returned for changes.

## Fields and answers

A type stores its fields as JSON (`approval_types.fields`). Answers are JSON keyed by field label. The browser sends
whatever it has; the server builds a check from the type's fields as they stand and keeps only answers that fit:
text up to 2000 characters, a number, a `YYYY-MM-DD` date, one of a choice's options, or pass or fail with a note. A
draft may leave fields empty; submitting requires every required field.

Each save copies the type's current fields onto the request (`approval_requests.fields`), and the request is shown
from that copy. So a draft or returned request is always edited against the current fields, and a request submitted
earlier stays readable, with its own questions, after the type's fields change. Types are snapshotted, not versioned.

## Who is who

There is no sign-in yet (schmeide/schmeide.app#84). Until it exists, the person acting is a name picked from a
plain list and sent with each change as `actorId`. The rules are enforced on the server against that id: nobody
decides a request filed under their own name, and only the named approver decides when a type has one. But anyone
can pick any name, so **the self-approval rule is only as strong as that choice**. Once sign-in exists, take the
actor from the signed-in user in the tRPC context, drop `actorId` from the inputs, point `approval_people` at the
platform's users, and remove the picker (`frontend/src/people/ActingAs.tsx`). These places carry a `ponytail:`
comment.

## Public intake

"Take requests from anyone with the link" on a type gives it a link with a random UUID token; turning it off forgets
the token, and turning it on again makes a new one. The form asks the type's fields and a free-text contact, and
files the request as submitted with no submitter. It calls only `publicForm` and `submitPublic`, which return the
type's name and fields and `{ received: true }`, nothing about any request.

Abuse protection:

- **Honeypot**: a `website` input placed off screen and `inert`, so people never reach it. A submission with it
  filled gets the same answer and is not kept.
- **Rate limit**: five submissions per address per ten minutes, answered with `TOO_MANY_REQUESTS`. It comes from
  the `ratelimit` shape, which this one requires; see [ratelimit.md](ratelimit.md).

## What usually varies

- The request types and their fields: edit `defaultTypes`, or use the Request types view in a running app.
- Who approves: name an approver on a type, or leave it to anyone but the submitter.
- Whether public intake is on: it is off for every type until turned on. To remove it, delete `PublicForm.tsx`, its
  route in `Requests.tsx`, the `publicForm` and `submitPublic` procedures, and the `public_token` column, then
  `make db/generate NAME=drop_public_intake`.

## Turning leave requests into another app

1. Replace `defaultTypes` with the project's types: "Expense claim" (amount as a number, date, what for as text),
   "Purchase request" (item, supplier, cost), "Van inspection" (one pass or fail field per item), "Maintenance
   request" (location, problem, urgency as a choice).
2. Rename the copy in `frontend/src/requests/` and the page title in `requests.shape.json` (then
   `make shape/registries`) if the app is not about "requests".
3. Turn on public intake for client intake, incident reports and maintenance requests from outside.
4. Run `make check test build`.

### Several approval steps

This shape has one step. For several (manager, then finance):

1. Add `approval_steps` (type, position, approver) and a `step` column on `approval_requests`.
2. In `transition`, an approval on any step but the last moves `step` on and keeps the request submitted; the last
   one approves it. Reject and return work from any step and reset `step`.
3. Check the approver against the current step instead of the type, and write a decision row per step as now.
4. Filter the review queue by the current step's approver.

## Limits

- The self-approval rule rests on a name anyone can pick until sign-in exists.
- Field kinds are deliberately few: no file uploads, multi-select or signatures. A file field needs the file upload
  building block, owned by the first shape that needs it.
- No rules across fields (the last day before the first): add them in `parseAnswers` per type if a project needs them.
- Fields cannot be reordered in the type editor; remove and add them again.
- People, types and requests are not deleted. Withdraw a request instead.
- Nobody is told when a request needs them or is decided; that needs email.
- The lists load every matching request without paging.
