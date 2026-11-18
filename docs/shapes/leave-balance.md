# Leave balance

A link shape: approved leave comes off the person's balance. It requires [requests](requests.md) and
[stock](stock.md), and has no page of its own. Its views appear on the request and stock item pages through the
`request` and `account` slots those shapes expose.

## What it has

- **Which balance a kind of leave draws on** (`leave_accounts`): a person, a kind (the request's "Kind of leave"
  answer, such as Vacation) and a ledger account, unique per person and kind, and an account serves one person's
  kind. A kind with no row, such as Sick or Unpaid, draws on nothing.
- **The postings** (`leave_postings`): the entry each request was taken off with, `request_id` and `entry_id` each
  unique, referencing `approval_requests` and `ledger_entries`.
- **On a leave request** (any request whose type has a "Kind of leave" field): "Choose Sam's leave balances" sets
  the balance each kind on that field draws on for the submitter, picked from the stock items. On an approved
  request whose kind draws on a balance, "Take off balance" records the entry; afterward the request links to the
  balance and says how many days came off from which day.
- **On a stock item**: whose leave it holds and a link to every request taken off it.

## The entry

An `out` entry of minus the request's "Days" answer on the account for its submitter and kind, dated the request's
"First day", with "Request #12" as the reference, the submitter's name as who, and "Vacation leave" as the note.

## Rules

- **A request posts once.** The entry and the posting row are written in one transaction that locks the request
  row and then checks for a posting; `unique(request_id)` backs it up. Two clicks, or two people, make one entry;
  the second is told the request has already come off a balance.
- **Only an approved request posts,** and only one with a "Kind of leave" answer, a "First day" and a whole number
  of "Days" above zero, since the ledger counts whole units. A request from the public link names no one, so it does
  not post. A kind with no balance is refused with a message naming the person and the kind.
- **The entry goes through the stock service** (`addEntry`, run inside this transaction), so the account lock and
  the floor hold. A balance with a floor refuses leave that would take it below; the back office recipe tells leave
  balances to allow below zero, so a posting there is never refused for the balance, and a negative balance is leave
  taken in advance.
- **Reversing the entry** on the stock item page leaves the posting, so the request cannot be posted again. A
  correction is a new entry by hand.
- **Setting a balance** that another person's kind already draws on is refused, naming whose it is. Choosing "No
  balance" removes the row.

## What usually varies

- The field labels it reads ("Kind of leave", "First day", "Days"): `labels` in `backend/src/services/leave.ts` and
  `kindLabel` in `frontend/src/leave/Leave.tsx`. Rename them with the request type's fields.
- The entry's note and reference: `postLeave` in the same file.

## Limits

- "Days" is typed by the submitter; nothing counts working days or public holidays.
- Half days do not post, because the ledger counts whole units.
- Two people pointing different kinds at one balance at the same moment get an error instead of the message.
