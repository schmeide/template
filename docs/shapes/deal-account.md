# Deal to account

A link shape: a won deal opens a ledger account named after it, which the agency recipe uses as a project in time
tracking. It requires [deals](deals.md) and [stock](stock.md) and has no page of its own. Its views appear on the deal
page and the item page through the `deal` and `account` slots those shapes expose.

## What it has

- **The link** (`deal_accounts` table): one row per deal that opened an account, with `item_id` as its primary key
  referencing `pipeline_items` and `account_id` unique, referencing `ledger_accounts`.
- **Open project**: on a deal in a stage that closes as won, with no account yet. It creates a ledger account with the
  deal's title as its name and the stock shape's defaults for the rest, then opens it.
- **Links both ways**: the deal shows "Opened as project Acme rebrand" and the account shows "Opened for deal Acme rebrand".

## Rules

- A deal opens one account. Opening locks the deal row, reads its stage, checks for an existing link and writes the
  account and the link in one transaction; the primary key on `item_id` and the unique `account_id` back it up. Two
  clicks, or two people, make one account.
- Only a deal in a stage that closes as won opens one. Moving the deal out of that stage later keeps the account, its
  entries and the link.
- The account is an ordinary ledger account afterward: renaming it or the deal does not change the other.

## What usually varies

- What the account starts with: the fields passed to `createAccount` in `openAccount`
  (`backend/src/services/dealAccounts.ts`), such as no floor for time tracking.
- The wording and the account's address, when stock is renamed (time, projects):
  `frontend/src/dealAccounts/DealAccount.tsx`.

## Limits

- A deal has at most one account. A second project for the same client is a new deal or an account added by hand.
- Nothing is closed when the deal is lost later; the account stays open until staff stop using it.
