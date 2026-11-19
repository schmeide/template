# Directory

A staff directory: everyone in the [people](people.md) list, with their email, phone, job title, team, start and
leaving dates. The names in "Acting as" are the staff, so the directory is that same list rather than a second one,
and once platform sign-in replaces `people` (schmeide/schmeide.app#84) it follows. It requires `people`.

## What it has

- **Entries** (`directory_entries`): one per person (`person_id`, unique, referencing `approval_people`), with
  email, phone, job title, team, start date, leaving date and notes. Every field but the person is optional.
- **Staff** (`#/directory`, titled Staff): every person in `approval_people`, with their entry where they have one,
  by name. It searches name, email, job title and team, filters by team, and shows current staff, or former staff
  on request.
- **A person's page** (`#/directory/<person id>`): every field, editable. A person in "Acting as" with no details yet
  has a page with empty fields.
- **Add a person** (`#/directory/new`): the name, added through `addPerson`, and the entry, in one transaction.
  A name already in "Acting as" with no entry gets one; a name already in the directory is refused.

## The rules

- **One entry per person,** enforced by `unique(person_id)`. Saving the first details for a person with no entry
  creates it, as an insert that updates on conflict, so two first saves at the same moment make one entry and the
  later one wins. Saving writes every field; one left out goes back to empty.
- **People are not deleted or renamed,** as in `people`. A leaver gets a leaving date and stays listed under former
  staff, so their past requests and read confirmations still name them.
- **Current and former.** Former staff are those with a leaving date before today. Everyone else is current,
  including a person with no entry, no leaving date, or one today or later.
- **Dates are calendar days** (`YYYY-MM-DD`). "Today" is the viewer's calendar day, sent by the browser, as in
  [assets](assets.md).
- **Search** matches name, email, job title and team, ignoring case, anywhere in the text. `%` and `_` are matched
  as themselves. Notes are not searched.
- **No salary, bank, address or health fields.** Every staff view is open to anyone with the app's address until
  sign-in can restrict who sees them.

## What usually varies

- **The fields:** add columns to `directory_entries` in `backend/src/db/schema/directory.ts`, run
  `make db/generate NAME=...`, then add them to `fields` in `backend/src/services/directory.ts`, to `StaffForm` in
  `frontend/src/directory/StaffPage.tsx`, and to the list table if they belong there. Keep sensitive fields out
  until sign-in exists.
- **The name:** a member list for a club or an association is the same shape. Rename the page title in
  `directory.shape.json` (then `make shape/registries`) and the copy in `frontend/src/directory/`.

## Limits

- The list is not paged; a staff list runs to hundreds.
- Teams are free text, so "Finance" and "finance" are two teams in the filter.
- Every visitor sees every entry, and anyone can edit any of them.
