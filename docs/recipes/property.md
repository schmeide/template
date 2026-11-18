# Property management

An app for a landlord, a letting agent or a block manager: a unit list, leases, maintenance requests from tenants,
and rent invoices. Made with `make shape/keep RECIPE=property` (`shapes/property.recipe.json`).

## Shapes and the app each becomes

The menu follows this order; `customers` comes last, right after the first shape that requires it.

- **Units**, the home page, from [assets](../shapes/assets.md). Follow the property and unit list under
  [Turning the asset register into a sibling](../shapes/assets.md#turning-the-asset-register-into-a-sibling). Each
  record is a unit: the name is its address ("Flat 2, 14 Mill Road"), the tag is your reference for it, and the
  category is the building or property it is in. The owner is the landlord, for an agent who manages for others. The
  expiry date becomes the next safety check due (gas, electrical or fire), so Expiring lists the checks to book.
- **Maintenance**, from [requests](../shapes/requests.md). Follow
  [Turning leave requests into another app](../shapes/requests.md#turning-leave-requests-into-another-app) with two
  types: "Maintenance request" (address, problem, urgency as a choice of emergency, urgent or routine, and when the
  tenant is home) with public intake on, for tenants, and "Inspection" (one pass or fail field per room or item),
  filled in at move-in, move-out and periodic visits. Name the property manager as the approver: approving a request
  means the repair will be done.
- **Rent**, from [invoices](../shapes/invoices.md). A rent invoice is an ordinary invoice to the tenant, with a line
  for the period's rent and a line for each other charge (a repair the tenant caused, a service charge). Payments are
  recorded on it as they arrive, and a sent invoice past its due date shows as overdue, which is the arrears list.
- **Tenants**, from [customers](../shapes/customers.md): rename it as
  [What usually varies](../shapes/customers.md#what-usually-varies) describes, and add the fields below.

### Why there is no rent ledger

This recipe does not keep [stock](../shapes/stock.md) as a rent ledger per tenancy. Invoices already hold what is
owed and what was paid, so a ledger beside them would record every rent charge and every payment a second time, and
the two would drift. A tenant's balance is the sum of their open invoices' balances. Showing that total on the
tenant's record is a change to `invoices` (see below).

## Links between them

None of these is built yet. Each is a shape of its own, and each has an issue. Until they exist, staff carry the
details across by hand: the lease lives in the unit's notes, rent invoices are made by hand each month, and the unit
is named in the request's answers.

- **Lease** (`assets` and `customers`, schmeide/template#57): the core of the app. A lease lets one unit to one tenant
  from a first day to a last day (none for a rolling lease), with rent per month or per week and a deposit. Two
  leases for one unit never overlap, enforced by locking the unit's row while the dates are checked and written,
  since an exclusion constraint needs an extension a generated migration cannot create. Leases are ended or
  cancelled, never deleted. Its page also lists the units with no current lease.
- **Lease to rent invoices** (the lease shape and `invoices`, schmeide/template#59): "Bill rent up to a date" makes a
  draft invoice for each rent period due, one per lease and period, enforced by a unique lease and period in a link
  table and a lock on the lease row. Monthly periods keep the lease's day of the month, clamped to the month's end.
  Voiding the invoice frees the period to be billed again.
- **Maintenance request to unit** (`requests` and `assets`, schmeide/template#60): staff choose the unit a request is
  about, and the unit lists its requests as its maintenance history. A request has at most one unit. The public form
  stays as it is and shows nothing about units.

## Vocabulary and fields

- Asset becomes unit, category becomes property, customer becomes tenant, invoice stays invoice (or "rent demand"),
  "Requests" becomes "Maintenance" in `requests.shape.json` and the copy in `frontend/src/requests/`.
- Units: replace the statuses with let, vacant, under repair and off the market (`registry_status` in
  `backend/src/db/schema/registry.ts` and `statuses` in `frontend/src/assets/format.ts`). Add bedrooms and the asking
  rent. Delete `defaultCategories` and the seeding in `listCategories` in `backend/src/services/registry.ts`, so the
  property list starts empty instead of with Computers and Phones.
- Tenants: add a correspondence address for after they leave and an emergency contact
  (`backend/src/db/schema/customers.ts` and `CustomerFields`).
- Set the business name, address and email in `frontend/src/invoices/business.ts`.

## Tenant details and sign-in

Until platform sign-in exists (schmeide/schmeide.app#84), every staff view is open to anyone who finds the app's
address. Do not record identity document numbers, bank details, references or credit checks in tenant fields or
request answers before then. Everything else in this recipe can run now.

## Not covered yet

- **Recurring rent**: the rent link bills when staff press its button. Billing on the day needs a job runner, which
  does not exist.
- **A tenant's balance** on their record: the tenants page does not list invoices. It is a change to `invoices`, which
  already requires `customers`.
- **Deposits**: the lease records the amount, but not where it is protected or what is returned at the end.
- **Joint tenants**: a lease has one tenant; the others go in its notes.
- **A property with its own fields** (address, owner, insurance): a property is a category, which has only a name.
  [Assets](../shapes/assets.md#turning-the-asset-register-into-a-sibling) says how to add it as a second table.
- **Repair progress and contractors**: a request is approved or rejected, with no stages after that and no contractor
  to send it to.
- **Photos on maintenance requests and inspections**: need the file upload building block (schmeide/template#34).
- **A tenant portal** for rent, requests and documents: the portal shape (schmeide/template#10) waits on platform
  sign-in (schmeide/schmeide.app#84). Share links cover sending an invoice.
- **Paying rent online** and reconciling bank payments: no online payment or bank import.
- **Letting a vacant unit** (enquiries, viewings, applications): no recipe keeps `deals` or `bookings` here.
- **Reminders** before a lease ends or a safety check is due: needs email.
