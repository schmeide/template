# Quote to invoice

A link shape: it converts an accepted quote into a draft invoice. It requires [invoices](invoices.md), which holds
both document types, and has no page of its own. Its views appear on the quote and invoice pages through the slots
that the invoices shape exposes.

## What it has

- **The link** (`document_conversions` table): one row per converted quote, with `quote_id` as its primary key and
  `invoice_id` unique, both referencing `documents`.
- **Make invoice**: on an accepted quote with no invoice yet. It creates a draft invoice for the same customer, with a
  copy of the quote's lines, notes and currency, issued today and due in 30 days, then opens it.
- **Links both ways**: the quote shows "Invoiced as INV-0009" and the invoice shows "Made from quote Q-0003".

## Rules

- A quote converts once. The conversion locks the quote row, checks for an existing link and writes the invoice and
  the link in one transaction; the primary key on `quote_id` backs it up. Two clicks, or two people, make one invoice.
- Only an accepted quote converts. The invoice is an ordinary draft afterward: editing it does not change the quote.
- Voiding the invoice does not free the quote. Make a new invoice by hand.

## What usually varies

- The payment term: `paymentDays` in `backend/src/services/conversions.ts`.
- What is copied: the fields passed to `insertDocument` in `convertQuote`.
- The wording, when quotes are renamed (proposals, estimates): `frontend/src/conversions/Conversion.tsx`.

## Limits

- Part conversions (a deposit invoice, then the balance) are not built: a quote has at most one invoice.
- "Today", for the issue date, is the server's UTC date, as in the invoices shape.
