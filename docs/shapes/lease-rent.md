# Lease to rent invoices

A link shape: it bills the rent on a lease as invoices. It requires [leases](leases.md), which holds the rent and
its period, and [invoices](invoices.md), which holds the invoices. It is built for
[property management](../recipes/property.md). Its views appear on the lease page through the leases shape's `lease`
slot and on the invoice page through the invoices shape's `invoice` slot. It also has a page of its own, Bill rent
(`#/rent`), because a run bills every lease at once and belongs to no one lease.

## What it has

- **Rent charges** (`rent_charges` table): which invoice bills each rent period of a lease, one row per lease and
  period start, with each invoice on at most one row.
- **Bill rent** (`#/rent`): "Bill rent up to" a day makes a draft invoice for every period due and links to each.
- **On a lease**: its rent invoices by period, with each invoice's number and status.
- **On an invoice made this way**: the lease (by its unit) and the period it bills.

## Rules

- **Periods.** A weekly lease's periods start every 7 days from its first day. A monthly lease's start on the same
  day of the month as its first day, clamped to the month's last day and always counted from the first day, not from
  the previous period: a lease from 31 January bills from 31 January, 28 February and 31 March. A period ends the day
  before the next one starts.
- **What a run bills.** For every lease that is not cancelled, each period that starts on or after the lease's first
  day, on or before its last day and on or before the day given, and that has no charge on an invoice that is not
  void. The invoice is for the lease's tenant, with one line, "Rent `<first day>` to `<last day of the period>`", at
  the lease's rent with no tax, due on the period's first day. It is issued on the day of the run, or on the period's
  first day when that is earlier, since an invoice cannot be due before it is issued.
- **A period is billed once.** Each lease is billed in its own transaction, which locks the lease's row before it
  reads that lease's charges and writes the invoice (through the invoices shape's `insertDocument`) and the charge
  together, with the unique lease and period behind it. Two runs at once queue on each lease, and the second finds
  its periods billed.
- **Voiding frees the period.** A charge whose invoice is void does not count; the next run bills the period again
  and points the charge's row at the new invoice.
- **A period the last day cuts short is billed in full.** Prorate it by editing the draft.
- **The invoice is an ordinary draft afterward.** Editing it does not change the lease, and changing the lease's rent
  does not change invoices already made.
- **The run is a service function that takes the day** (`billRent` in `backend/src/services/rentCharges.ts`), so a
  scheduled job can call it once a job runner exists. Until then staff press the button.

## What usually varies

- **The line**: the description, or a tax rate for commercial lets where rent is taxed, in `billRent`.
- **When an invoice is due**: on the period's first day. For rent due a few days in, add days to `dueDate` there.
- **Other charges** on the same invoice (a service charge, parking): add lines in `billRent` from columns on
  `leases`.

## Limits

- A run bills every lease, one transaction each, so a large portfolio's first run with years of periods is slow;
  bill by property once that matters.
- An invoice replaced after it was voided no longer shows its lease; its line still names the period.
