# Leases

A lease lets a unit to a tenant for a span of days. It joins two shapes, so it is a shape of its own that requires
both: [assets](assets.md), whose records are the units, and [customers](customers.md), who are the tenants. It also
requires [money](money.md) for amounts. Unlike most links it is an app's main record, so it has a page of its own,
Leases (`#/leases`). It is built for [property management](../recipes/property.md).

## What it has

- **Leases** (`leases` table): the unit (`registry_records`), the tenant (`customers`), the first day, the last day
  (empty for a rolling lease), the rent in cents per month or per week, the deposit in cents, notes, and when it was
  cancelled.
- **All leases**: current, upcoming, ended and cancelled leases, each in its own table, filtered by unit and by
  tenant.
- **Vacant**: the units that are not archived and have no lease running today, each with a link to let it.
- **Add a lease**: pick a unit and a tenant, the days, the rent and the deposit.
- **A lease page** (`#/leases/<id>`): its terms to edit, "End lease" on a day, and "Cancel lease" before it starts.
  Everything but the unit can be edited; a lease on the wrong unit is cancelled and added again.
- **Slot**: the lease page renders `<Slots name="lease" id={id} />` at its end, where link shapes add their views.
  With no link shape kept it renders nothing.

Rent and deposit are typed and shown through the money shape's `parseScaled` and `formatMoney`, in the currency in
`frontend/src/leases/format.ts`.

## Rules

- **No overlap.** Two leases that are not cancelled never share a day on one unit. Both days are included, and a
  lease with no last day runs on forever. Adding a lease, editing it and ending it each run in one transaction that
  locks the unit's `registry_records` row first, then checks for an overlap and writes. Two people letting the same
  unit at once queue, and the second is refused with `CONFLICT`, naming the lease it clashes with. An exclusion
  constraint would do this in the database, but it needs the `btree_gist` extension, which a generated migration
  cannot create (as [assets](assets.md) says of `pg_trgm`).
- **Dates are calendar days** (`YYYY-MM-DD`), and the last day is on or after the first (a check constraint too).
  Current, upcoming, ended and vacant use the viewer's calendar day, sent by the browser, as the asset register's
  Expiring view does.
- **Ending sets the last day.** It may move the last day earlier or give a rolling lease one, never before the first
  day. To extend a lease, edit its last day, which checks for an overlap.
- **Leases are not deleted.** A lease entered by mistake is cancelled: it keeps its row, leaves the overlap check and
  shows as cancelled, and it cannot change after that. Only a lease that has not started on the viewer's day can be
  cancelled; one that has started is ended instead.
- **A lease is made only on a unit that is not archived.** Archiving a unit stays the asset register's business, and
  a lease on a unit archived later keeps it; the lease page says the unit is archived.
- **One tenant per lease.** Joint tenants are named in the notes.

## What usually varies

- **Names**: "unit" and "tenant" are the property words. For equipment hire, a lease becomes a rental of an asset to a
  customer, with a weekly or daily rate; add `daily` to `lease_rent_period` and to `rentPeriods` in
  `frontend/src/leases/format.ts`.
- **The currency**: `currency` in `frontend/src/leases/format.ts`.
- **Fields**: a break clause, a rent review date or a guarantor are columns on `leases` and fields in `LeaseForm`.

## Limits

- The lists are not paged, and the unit picker lists every unit that is not archived; add paging or a search past a
  few thousand.
- Joint tenants need a lease-tenants table once a project bills or contacts them separately.
- Where a deposit is protected, and what is returned, is not recorded.
