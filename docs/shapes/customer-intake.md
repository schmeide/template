# Customer intake

A link shape: staff send a customer a one-time link to a form, and the answers come back as a request linked to that
customer. It requires [requests](requests.md), whose request types are the forms, and [customers](customers.md). Its
staff view appears on a customer's page through the `customer` slot that the customers shape exposes; the form itself
is a page of its own at `#/intake/<token>`.

## What it has

- **The link** (`customer_intakes` table): a random UUID `token` as its primary key, the customer, the request type,
  and `request_id`, unique and empty until the form comes back.
- **Send intake form**: on a customer, pick a request type and make a link. Copy it into an email or message. Any type
  works, whether or not its public intake is on.
- **The form** (`#/intake/<token>`): the type's name and fields, with the same inputs as the public form. It files a
  submitted request whose contact is the customer's name, so staff see whose it is in the review queue.
- **The customer's list**: each link sent, newest first, with its link while it waits and a link to the request once it
  is filled in.
- **The intake page** (`#/intake`, in the menu as "Intake forms"): says that links are sent from a customer's page.

## Rules

- A link is used once. Submitting locks the link's row, checks that it has no request yet, and files the request and
  sets `request_id` in the same transaction; the unique `request_id` backs it up. Of two people sending the same link at
  once, one files the request and the other is told to ask for a new link. A used link's form says the same.
- Answers are checked by the requests shape's own `parseAnswers`, as public intake checks them, and the form carries the
  same `website` honeypot from `publicRequestSchema`: filled in, the answer is the same and nothing is kept. Answers
  that fail the check leave the link open to try again.
- Five submissions per address per ten minutes, from the [ratelimit](ratelimit.md) shape, counted apart from public
  intake.
- The form shows nothing about the customer, not even their name, so a leaked link reveals nothing. `form` returns the
  type's name and fields; `submit` returns `{ received: true }`.

## What not to collect before sign-in

Until platform sign-in exists (schmeide/schmeide.app#84), every staff view is open to anyone who finds the app's
address, and that includes the requests where intake answers land. Until then, a project must not ask for health
details in an intake form: conditions, medication, allergies, injuries, pregnancy or treatment notes. Ask for contact
preferences, how they heard of you, and consent instead. The link's privacy only covers the form; the answers are as
open as every other staff view.

## What usually varies

- The wording, when customers are renamed (clients, patients): `frontend/src/intakes/`.
- The page title and path: `customer-intake.shape.json` (then `make shape/registries`).
- Whether links expire: add an `expires_at` column with a default and check it in `submitIntake` and
  `getIntakeForm`.

## Limits

- Links do not expire and cannot be withdrawn. A link waits until it is used.
- Nobody is told when a form comes back; that needs email. It shows in the review queue and on the customer.
- The form still shows the app menu, as public intake does, until sign-in separates staff views from public ones.
