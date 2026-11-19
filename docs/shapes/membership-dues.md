# Membership dues

A link shape: it bills a membership period's dues onto an invoice. It requires [membership](membership.md), which
holds the periods, and [invoices](invoices.md), which holds the invoice. It has no page of its own: its views appear
on a member's periods through the membership shape's `period` slot, and on the invoice through the invoices shape's
`invoice` slot.

## What it has

- **Period invoices** (`period_invoices` table): which invoice bills which period, one row per invoice.
- **Bill dues**, on each period of a member with no live invoice: makes a draft invoice for the member with one line,
  "Adult membership, 2030-03-15 to 2031-03-14" (or "from 2030-03-15" for life), at the fee copied onto the period, a
  quantity of 1 and a tax rate of 0, issued today and due in 30 days, then opens it.
- **Dues state**, on each period: unbilled, billed or paid, read from the linked invoice's status, with a link to it.
  The invoice links back to the member.

## Rules

- **A period has at most one invoice that is not void.** A constraint cannot see the invoice's status, so billing
  locks the period's row, checks for a live invoice, and writes the invoice (through the invoices shape's
  `insertDocument`) and the link in one transaction. Two people billing the same period at once queue, and the second
  is told it is already billed.
- **A period with no fee** (life at no cost, honorary) is never billed and offers no button.
- **Voiding the invoice frees the period**, so it can be billed again. The void invoice keeps its link, so it still
  says which period it was for; that is why a period may have more than one row, and why `document_id`, not
  `period_id`, is the unique key.
- **Paying the invoice changes nothing on the period.** Membership status still comes from the dates, so a member who
  has not paid is still current until their period ends.

## What usually varies

- The line's wording: `billPeriod` in `backend/src/services/dues.ts`.
- Tax on dues: the rate on that line, in basis points.

## Limits

- One period per invoice; a family billed for several members gets several invoices.
- Nothing bills a period by itself on renewal; staff press "Bill dues". Recurring dues need online payment and a job
  runner.
