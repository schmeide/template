# Internal back office

An app a business runs for its own staff: leave and expense claims, leave balances, the equipment people hold, and
onboarding. Made with `make shape/keep RECIPE=back-office` (`shapes/back-office.recipe.json`).

## Shapes and the app each becomes

The menu follows this order: Requests (the home page), Leave balances, Assets and Handbook, renamed as below.
`requests` and `handbook` both require `people`, so the "Acting as" names are one list of staff across the app.

- **Requests**, the home page, from [requests](../shapes/requests.md), which ships with leave. Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app) and keep
  Leave beside the new types:
  - "Leave": add "Days" (a required number, whole days), which the leave balance link takes off the balance.
  - "Expense claim": amount as a number, date, what for as text, and a choice of cost type.
  - "New starter checklist" and "Leaver checklist": one pass or fail field per step (contract signed, laptop
    issued, accounts opened; laptop returned, accounts closed). The person handling the start or the leave files one
    per starter or leaver, with the name in the first field.

  Name the manager as approver on Leave and the finance lead on Expense claim.

- **Leave balances**, from [stock](../shapes/stock.md). An item is one person's balance of one kind of leave ("Ana,
  vacation"), the unit is days and an entry is a whole number of days. Each year starts with an `in` entry for the
  allowance; carry-over and corrections are adjustments. Turn on "Allow stock below zero" on every balance, so taking
  leave in advance shows as a negative balance instead of being refused, and remove the low stock filter. Rename as
  steps 1 and 6 of [Turning stock into time tracking](../shapes/stock.md#turning-stock-into-time-tracking) describe;
  the entry kinds stay in, out and adjustment.
- **Assets**, from [assets](../shapes/assets.md), which ships as exactly this. The owner is the person who holds the
  asset, typed as their name in "Acting as", so searching a leaver's name lists what to collect.
- **Handbook**, from [handbook](../shapes/handbook.md), as onboarding and policies: follow the training tracker in
  [What usually varies](../shapes/handbook.md#what-usually-varies). A section per stage ("1 First day", "2 First
  week") or per policy area, read tracking on for every page a new starter must confirm.

## The staff directory

A directory (email, phone, job title, team, start and leaving dates) is a registry, and the asset register already
uses the `assets` shape, which cannot be kept twice. The two ways out were a kind column on `registry_records`, so
assets and staff share one table, or `people` grown into a directory. This recipe takes `people`:

- **Staff are already the `people` list.** Everyone who files a request or confirms a page is a name in
  `approval_people`. A directory in the registry would be a second list of the same people, with nothing keeping the
  two in step, which [Contacts](../shapes/assets.md#turning-the-asset-register-into-a-sibling) in the assets doc
  warns against.
- **Sign-in replaces `people`.** Once platform sign-in exists (schmeide/schmeide.app#84), `approval_people` points at
  the platform's users. A directory built on it follows; one in the registry would have to be matched to users by
  hand.
- **The fields do not fit.** An asset has a tag, a category, a status and an expiry date; a person has none of them.
  A kind column would leave half the columns empty for each kind and add a kind filter to every query, import and
  export of the register.

`people` is a building block with no page, and `requests` and `handbook` require it, so growing it in place would add
a directory page to every project that keeps either. The directory is a shape of its own that requires `people`
(schmeide/template#55). It is not built yet. Until it exists, the names in "Acting as" are the staff list and the
handbook can hold a "Who is who" page with contact details.

## Links between them

Not built yet. It is a shape of its own that requires both sides, and it has an issue. Until it exists, whoever
approves leave records an `out` entry on the person's balance by hand, with the request's number as the reference.

- **Approved leave to balance** (`requests` and `stock`, schmeide/template#56): a link table maps a person and a kind
  of leave to a ledger account. On an approved leave request, "Take off balance" records an `out` entry of the
  request's days on that account, dated its first day. A request posts once, enforced by a unique request id in a
  link table and a lock on the request row. Kinds with no account (sick, unpaid) draw on nothing. Reversing the entry
  does not free the request.

`assets` and `handbook` need no link: the asset owner and the handbook reader are matched to staff by name.

## Vocabulary and fields

- Stock becomes leave balances and item becomes balance; asset and request stay as they are.
- Expense claims: amounts are numbers in the currency's units, since request fields have no money kind.
- Assets: set `defaultCategories` to what the business owns (Laptops, Phones, Monitors, Keys and cards) and add a
  serial number if the tag is not one.
- Handbook: default `trackReads` to true in the editor.

## Not covered yet

- **The staff directory**, as described under [The staff directory](#the-staff-directory) (schmeide/template#55).
- **Roles** (only managers approve, only HR sees salaries): every staff view is open to anyone with the app's address
  until platform sign-in exists (schmeide/schmeide.app#84). Keep salaries, bank details, home addresses and health
  details out of every field and page until then.
- **Receipts on expense claims**: need the file upload building block (schmeide/template#34).
- **Paying expense claims back**: an approved claim is not totaled or paid; finance pays from the review list.
- **Working days**: "Days" on a leave request is typed by the submitter. Nothing counts weekends or public holidays.
- **Half days**: the ledger counts whole units. Store half days and format them as days, as
  [What usually varies](../shapes/stock.md#what-usually-varies) describes for fractions.
- **An asset's holder as a person**: the owner is free text, so a renamed or misspelled name loses the asset from a
  search. A link from `assets` to `people` would fix it; it waits for the directory.
- **Reminders** (a page to read, a request to decide, an asset's warranty ending): nothing sends email.
