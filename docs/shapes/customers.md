# Customers

The people and businesses a project deals with: name, email, phone and address, with a list and a detail page
(`customers` table, Customers page).

The detail page renders `<Slots name="customer" id={id} />`, where link shapes add their views; with none kept it
renders nothing. [customer-intake](customer-intake.md) adds "Send intake form" there.

It is a shape of its own because more than one shape needs it. Invoices bill a customer, and a deal's contact is a
customer, so a project that keeps both shares one list. Nobody keeps it on its own; it comes with the shapes that
require it.

## What usually varies

- The name: clients, contacts, patients, members. Rename the page title in `customers.shape.json` (then
  `make shape/registries`) and the copy in `frontend/src/customers/Customers.tsx`. The table can keep its name.
- The fields: a company name, a tax number, separate billing and delivery addresses. Add columns in
  `backend/src/db/schema/customers.ts`, run `make db/generate NAME=...`, and add the inputs to `CustomerFields`.

## Limits

- Customers are never deleted, so documents and deals that point at them keep their history.
- The list loads every customer without paging or search.
