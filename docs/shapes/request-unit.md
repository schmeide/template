# Request to unit

A link shape: it files a request against the unit it is about. It requires [requests](requests.md), which holds the
requests, and [assets](assets.md), whose records are the units. It is built for
[property management](../recipes/property.md), where maintenance requests come from tenants, and has no page of its
own. Its views appear on the request page through the requests shape's `request` slot and on the asset page through
the assets shape's `asset` slot.

## What it has

- **Request units** (`request_units` table): the unit a request is about, one row per request.
- **On a request**: the unit, with "Change unit" and "Clear unit". Staff choose a unit by searching the units that are
  not archived (the asset register's own search, by name or tag) and pressing "Choose".
- **On a unit**: its maintenance history, the requests filed against it, newest first, with type, status and the day
  each was submitted, each linking to the request.

## Rules

- **A request is about at most one unit.** The request is the table's key, so choosing another unit replaces the row;
  two people choosing at once leave one.
- **Only a unit that is not archived can be chosen.** The unit's row is share-locked while the link is written, so it
  cannot be archived halfway. A unit archived later keeps its history, and the request shows it as archived.
- **Linking leaves the request's status alone** and is allowed in any status, so staff can file old requests too.
- **The public form is unchanged.** It shows nothing about units; the tenant gives the address in a text field, and
  staff choose the unit when they review the request.

## What usually varies

- **Names**: "unit" and "maintenance history" are the property words. For equipment, they become the asset and its
  service history.
- **Several assets per request** (a repair that touches two machines): drop the key on `request_id`, key the table
  on both columns, and let the view list several.

## Limits

- The history is not paged.
- The search also matches the owner and notes, as the asset register's search does.
