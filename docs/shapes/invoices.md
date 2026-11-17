# Invoices

A line-item document: a document addressed to a customer, made of lines that add up to a total, that moves through
statuses and can be shared. This shape ships it as invoicing. Quotes, estimates, purchase orders, work orders,
receipts, credit notes and proposals are the same shape with different names, fields and statuses.

## What it has

- **Customers**: from the `customers` shape, which this one requires. See [customers.md](customers.md).
- **Documents** (`documents`, `document_lines`, `payments` tables, Invoices page): a list with a status filter and
  search, an editor with add, remove and reorder lines and live totals, a read-only view, payments, a print-ready
  layout and a public share link.
- **Money** (`backend/src/services/money.ts`, `frontend/src/money/`): amounts are integers. Money is in minor units
  (cents), quantity in thousandths, tax rate in basis points (`2000` is 20%). A line's amount and its tax are each
  rounded once, half away from zero, and tax is rounded per line before it is summed. The editor asks the server for
  its totals, so the screen always rounds the way the saved document does.
- **Numbering**: each document type has a row in `document_counters`. Creating a document increments that row in the
  same transaction, so numbers are sequential with no gaps, and concurrent creates wait for each other instead of
  colliding. `unique(type, number)` backs it up. Documents are voided, never deleted, so no number goes missing.
- **Statuses**: `draft → sent → paid`, and `draft` or `sent` can become `void`. Any other change is refused. Only
  drafts can be edited. A payment can be recorded only on a sent document, up to its balance, and the document becomes
  `paid` when the balance reaches zero. **Overdue** is not stored: a sent document past its due date shows as overdue.
- **Share link**: `#/invoices/share/<token>`, where the token is a random UUID. It shows a sent document without
  internal ids and without staff actions. Drafts are never shared.
- **The issuing business**: its name, address and email are constants in `frontend/src/invoices/business.ts`. Edit
  them for the project.

## What usually varies

- The document's name and number prefix (`prefixes` in `backend/src/services/documents.ts`).
- The status list and the allowed transitions (`documentStatus` in the schema, `transitions` in the service).
- Which fields show: due date, valid-until date, delivery address.
- Whether payments apply.
- Whether one document converts into another (a quote becomes an invoice). That link is its own shape.

## Turning invoices into quotes

1. Rename the document type: `["invoice"]` becomes `["quote"]` in `documentType`, and its prefix becomes `"Q"`.
2. Replace the statuses with `draft`, `sent`, `accepted`, `declined` and `void`, and the transitions with
   `draft → sent | void`, `sent → accepted | declined | void`.
3. Rename `dueDate` to `validUntil` (column `valid_until`). Overdue becomes "expired": a sent quote past
   `validUntil`. Update `displayStatus` and `statusCondition` in the service.
4. Remove payments: the `payments` table, `recordPayment`, its router procedure and the payment form in
   `InvoiceView.tsx`. Totals stop showing paid and balance.
5. Rename the router key, page path, titles and copy from invoice to quote: `invoices.shape.json` (then
   `make shape/registries`), `backend/src/routers/invoices.ts`, `frontend/src/invoices/`.
6. Run `make db/generate NAME=quotes`, then `make check test build`.

## Quotes and invoices together

Keep one `documents` table and add `"quote"` to `documentType`. It gets its own numbering from its own counter row.
Add a `quotes` router and page that pass `type: "quote"` the way `invoicesRouter` passes `"invoice"`. Converting a
quote into an invoice is a link shape that requires this one.

## Limits

- PDF files and email are not built. The print view (the browser's "Save as PDF" included) and the share link cover
  sending until a shared PDF or email building block exists.
- There is no sign-in, so every visitor is trusted staff. The share link is the only view meant for customers.
- "Today", for overdue, is the server's UTC date.
- Decimal input accepts `.` as the decimal separator only.
- Lists load every matching document without paging.
