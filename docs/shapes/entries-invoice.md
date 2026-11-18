# Entries to invoice

A link shape: it bills ledger entries onto an invoice. It requires [stock](stock.md), which holds the entries, and
[invoices](invoices.md), which holds the invoice. It is built for time tracking (the stock shape turned into minutes)
and has no page of its own. Its view appears on the item page through the stock shape's `account` slot.

## What it has

- **Billing** (`billing_accounts` table): who a ledger account is billed to and its rate in cents per hour, one row per
  account. The rate lives here because only billing needs it. Set both on the item page.
- **Billed entries** (`billed_entries` table): which entries an invoice holds, one row per entry and invoice.
- **Preview and Create invoice**: for a period, the unbilled billable entries, one line each with the hours (in
  thousandths) at the rate. "Create invoice" makes a draft invoice for the account's customer with those lines,
  issued today and due in 30 days, then opens it.

## Rules

- **An entry lands on at most one invoice that is not void.** A constraint cannot see the invoice's status, so billing
  locks the account's `billing_accounts` row, reads the unbilled entries, and writes the invoice (through the invoices
  shape's `insertDocument`) and the `billed_entries` rows in one transaction. Two people billing the same account at
  once queue, and the second finds nothing left to bill.
- **Voiding an invoice frees its entries.** An entry counts as billed only while one of its invoices is not void, so
  the next billing of its period picks it up again.
- **Only billable entries are billed**: the kinds in `billableKinds` in `backend/src/services/billing.ts`.
- **An entry and its reversal that are both unbilled cancel out**, and neither is billed, wherever their dates fall.
- **A reversal of a billed entry is a credit on the next invoice.** It becomes a line with the same hours at a negative
  rate, dated and described as a correction of the entry. Document lines keep their positive quantity, so the invoices
  shape's validation is unchanged. An invoice must still come to more than zero: while the credits in a period
  outweigh its charges, billing is refused and the credits wait for the next invoice.
- **An account with no billing row cannot be billed.** The view and the error both say to set the customer and rate
  first.
- The invoice is an ordinary draft afterward. Editing its lines does not change which entries it holds; void it and
  bill again instead.

## What usually varies

- **What is billed.** `billableKinds` holds `"in"` while the ledger is stock. After
  [Turning stock into time tracking](stock.md#turning-stock-into-time-tracking), set it to `["billable"]`; the type
  check fails until you do.
- **The unit.** `toThousandths` turns minutes into hours. For mileage in kilometers, bill `quantity * 1000` at a rate
  per kilometer; for expenses in cents, bill a quantity of `1000` with the entry's amount as the unit price (both in
  `pendingLines`). Rename "Rate per hour" and "Hours" in
  `frontend/src/billing/Billing.tsx` to match.
- **The line text**: the description built in `pendingLines`.
- **The payment term**: `paymentDays` in the service.

## Limits

- One rate per account. Rates per person or per role are not built.
- Invoices are made in the documents table's default currency, and lines carry no tax.
- Billing reads every unbilled entry of the account to pair entries with their reversals. That is the unbilled
  backlog, not the history, so it stays small while the account is billed regularly.
- "Today", for the issue date, is the server's UTC date, as in the invoices shape.
