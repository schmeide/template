# Membership

Who is a member, at what level, and until when: a club's members list with levels and dated renewal periods. It
requires [customers](customers.md), since a member is a customer with a period, and [money](money.md) for the fees.
Season tickets, subscriptions and annual passes are the same shape with different names.

## What it has

- **Levels** (`membership_levels`, the Levels section of `#/members`): a name (Adult, Junior, Family, Life), a fee in
  cents and a length in months (12 for a year, empty for life). A level is retired, never deleted, since periods
  refer to it; a retired level is not offered for new periods.
- **Periods** (`membership_periods`): customer, level, `starts_on` and `ends_on` (both days included, `ends_on` null
  for life), with the level's name and fee copied on. Changing a level's fee later changes no existing period, so
  what a member owes for a period stays what it was. One row per period, so a member's history stays readable.
- **Members** (`#/members`): every customer with a period, with their latest level, status and end date, filtered by
  status. "Add a member" joins a customer who has no period. A customer without a period (a donor, someone who
  signed up for one event) is not a member and is not listed.
- **A member** (`#/members/<customer id>`): their periods, latest first, and "Renew".
- **Slot**: each period renders `<Slots name="period" id={period.id} />`, where link shapes add their views.
  [membership-dues](membership-dues.md) adds "Bill dues" and the dues state there. With none kept it renders nothing.

## Status is not stored

A member's status comes from their latest period and today, the server's UTC date, as for overdue invoices:

- **Current** when the latest period has not ended, or is for life.
- **Due for renewal** when it ends within the next 30 days.
- **Lapsed** when it has ended.

A member who renews early is current again at once, since the new period is now the latest.

## Joining and renewing

The next period starts today for a new or lapsed member, and the day after the latest one ends for a current one,
including one renewing on the last day. It runs for the level's months: a year from 2030-03-15 ends 2031-03-14. A
member for life has nothing to renew.

Periods never overlap. `addPeriod` locks the customer's row (`select … for update`), checks the latest period and
inserts, in one transaction. The request names the latest period staff saw, so of two clicks on "Renew" the second
finds a newer period than it saw and adds nothing; staff reload to see it. The database backs this up: a check keeps
`ends_on` after `starts_on`, and a member cannot have two periods starting the same day.

## What usually varies

- The levels themselves are data, set on the page. Rename "member" in `frontend/src/membership/Members.tsx` and the
  page title in `membership.shape.json` (then `make shape/registries`) for a subscription or a season ticket.
- The currency: `currency` in `frontend/src/membership/Members.tsx`.
- How long a member is due before the end: `dueDays` in `backend/src/services/membership.ts`.

## Limits

- Billing the fee for a period is the [membership-dues](membership-dues.md) link; without it, staff make the invoice
  by hand.
- A period cannot be edited or removed, and there is no way to end a life membership early.
- A start date past the 28th rolls over a short month for monthly levels (Jan 31 plus a month ends Mar 2).
- No renewal reminders are sent; that needs email and a job runner.
- The members list loads every member at once, without paging or search.
