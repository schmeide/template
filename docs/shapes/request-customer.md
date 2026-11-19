# Request to customer

A link shape: it turns an approved request, such as a membership application from the public form, into a customer's
record. It requires [requests](requests.md) and [customers](customers.md), and has no page of its own. Its views appear
on the request and customer pages through the `request` and `customer` slots those shapes expose.

## What it has

- **The link** (`request_customers` table): one row per converted request, with `request_id` as its primary key,
  referencing `approval_requests` and `customers`. A customer may have several requests.
- **Add to customers**: on an approved request with no customer yet. It offers a new customer filled from the answers
  whose labels are Name, Email, Phone and Address (case does not matter; Name falls back to the request's contact),
  for staff to check and save, or a pick of an existing customer. Then it opens the customer.
- **Links both ways**: the request shows "Added to customers as Pat Lee", and the customer page lists their linked
  requests.

## Rules

- A request links to one customer, once. The conversion locks the request row, checks for an existing link, and
  writes the customer and the link in one transaction; the primary key on `request_id` backs it up. Two clicks, or two
  people, make one customer.
- Only an approved request converts, and its status does not change afterward.
- An existing customer is always a person's choice, never matched on the typed email: anyone can type a member's
  email into a public form.
- The new customer is made through the customers service (`createCustomer`), so its validation still holds.

## What usually varies

- Which answers fill which field: the labels passed to `answerFor` in
  `frontend/src/requestCustomers/RequestCustomer.tsx`.
- The wording, when customers are renamed (members, clients): the same file.

## Limits

- Answers other than the four named ones stay on the request; nothing copies them to the customer.
- Deleting is not built on either side, so a link stays once made.
