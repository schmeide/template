# Invoices

A line-item document: a document addressed to a customer, made of lines that add up to a total, that moves through
statuses and can be shared. This shape ships it as invoices and quotes, two document types in one table. Estimates,
purchase orders, work orders, receipts, credit notes and proposals are the same shape with different names, fields and
statuses.

## What it has

- **Customers**: from the `customers` shape, which this one requires. See [customers.md](customers.md).
- **Documents** (`documents`, `document_lines`, `payments` tables, Invoices and Quotes pages): a list with a status
  filter and search, an editor with add, remove and reorder lines and live totals, a read-only view, payments on
  invoices, a print-ready layout and a public share link. The `type` column says whether a document is an invoice or a
  quote; the `invoices` and `quotes` routers come from one router factory and each sees only its own type. On screen
  the differences live in `kinds` in `frontend/src/invoices/format.ts`.
- **Money**: from the `money` shape, which this one requires. See [money.md](money.md). The editor asks the server
  for its totals, so the screen always rounds the way the saved document does.
- **Numbering**: each document type has a row in `document_counters`, so invoices (`INV-0001`) and quotes (`Q-0001`)
  are numbered apart. Creating a document increments that row in the
  same transaction, so numbers are sequential with no gaps, and concurrent creates wait for each other instead of
  colliding. `unique(type, number)` backs it up. Documents are voided, never deleted, so no number goes missing.
- **Statuses**: an invoice goes `draft → sent → paid`, and `draft` or `sent` can become `void`. A quote goes
  `draft → sent → accepted | declined`, and `draft` or `sent` can become `void`. Any other change is refused. Only
  drafts can be edited. A payment can be recorded only on a sent invoice, up to its balance, and the invoice becomes
  `paid` when the balance reaches zero. **Overdue** and **expired** are not stored: a sent invoice past its due date
  shows as overdue, and a sent quote past its valid-until date (the same `due_date` column) shows as expired.
- **Share link**: `#/invoices/share/<token>` or `#/quotes/share/<token>`, where the token is a random UUID. It shows
  a sent document without internal ids and without staff actions. Drafts are never shared.
- **The issuing business**: its name, address and email are constants in `frontend/src/invoices/business.ts`. Edit
  them for the project.

## What usually varies

- The document's name and number prefix (`prefixes` in `backend/src/services/documents.ts`, and `kinds` in
  `frontend/src/invoices/format.ts`).
- The status list and the allowed transitions (`documentStatus` in the schema, `transitions` in the service).
- Which fields show: due date, valid-until date, delivery address.
- Whether payments apply.
- Which document types the project keeps.
- Whether one document converts into another (a quote becomes an invoice). That link is its own shape.

## Renaming a document type

A proposal or an estimate is the quote renamed. Change its prefix in `prefixes`, its labels in `kinds`, and the page
title in `invoices.shape.json` (then `make shape/registries`). Keep the type value `"quote"` in the database: an enum
value is never renamed (see `AGENTS.md`), and the screen never shows it.

## Keeping only invoices or only quotes

Delete the page you do not need from `invoices.shape.json` and run `make shape/registries`, then delete its file
(`Quotes.tsx`, or move `DocumentPage` out of `Invoices.tsx` first). Its router and enum value can stay unused. A
project that keeps only quotes deletes the payment form in `InvoiceView.tsx` too.

## Limits

- PDF files and email are not built. The print view (the browser's "Save as PDF" included) and the share link cover
  sending until a shared PDF or email building block exists.
- There is no sign-in, so every visitor is trusted staff. The share link is the only view meant for customers.
- "Today", for overdue, is the server's UTC date.
- Decimal input accepts `.` as the decimal separator only.
- Lists load every matching document without paging.
