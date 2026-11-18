# Assets

A registry: a searchable directory of things, each with a detail page. This shape ships it as an asset register.
Contacts, a vendor list, an employee directory, a product catalog, a property and unit list, and a license or
document expiry tracker are the same shape with different names and fields.

## What it has

- **Assets** (`registry_records`, `#/assets`): name, asset tag, category, status, owner, an expiry date and notes.
  The list searches, filters by category and status, sorts, and pages on the server, 50 to a page, and downloads
  the current filter as CSV.
- **Categories** (`registry_categories`, `#/assets/categories`): a list to file assets under. A new register starts
  with Computers, Phones, Furniture, Vehicles and Tools, added the first time the list is read, because a migration
  cannot seed rows (a project's migrations are regenerated). Names are unique ignoring case.
- **Asset page** (`#/assets/<id>`, and `#/assets/new` to add one): every field, editable, and archive or restore.
- **Expiring** (`#/assets/expiring`): assets whose date has passed or falls within the next 30, 60 or 90 days.
- **Import** (`#/assets/import`): a CSV file, previewed, then imported.

## The rules

- **Archive, not delete.** Archiving sets `archived_at`; the asset leaves the list and the expiring view, and
  shows under the "Archived" status filter. Restoring clears it, and the asset keeps the status it had. The service
  has no delete.
- **Search** matches name, tag, owner and notes, ignoring case, anywhere in the text. `%` and `_` are matched as
  themselves.
- **Paging** orders by the chosen sort, then by id, so assets with equal names or dates keep their order from page
  to page. Assets with no date come last in either direction. The list returns the page and the total that match.
- **Expiry.** Dates are calendar days. "Today" is the viewer's calendar day, which the browser sends with the
  request; the view shows every asset with a date on or before today plus the window. An asset expiring today is
  included; the day after the window is not.
- **Import.** The first row names the columns, matched ignoring case: Name (required), Tag, Category, Status,
  Owner, Expires and Notes, in any order. Other columns are listed as ignored. Blank rows are skipped. Every row is
  checked with the same schema as the add form (`newRecordSchema`), and each problem is reported with its row
  number, counting the header as row 1 as a spreadsheet does. Then:
  - A file with any problem imports **nothing**. Fix the file and import it again; there are no half-imported rows
    to find and no duplicates to clean up.
  - An unknown category is a problem, not a new category, so a typo cannot add one. Add the category first.
  - Status is one of in use, in storage, in repair or lost, in any case; empty means in use. Dates are
    `YYYY-MM-DD`.
  - Importing checks the file again on the server rather than trusting the preview.
  - A file holds at most 5,000 rows and 300,000 characters. The request carries the file's text, and Fastify and
    nginx both cap a request at 1 MiB; 300,000 characters fit even at 3 bytes each. Split a bigger file.
- **Export** writes the same columns as import, in the list's order, for the whole filter (no paging), so an
  exported file imports again. Statuses are written as stored (`in_use`). Text the CSV writer defuses with a leading
  apostrophe (a name starting with `-`, say) comes back with the apostrophe.

## What usually varies

- **The name and copy:** rename the router key, page path and title in `assets.shape.json` (then
  `make shape/registries`), `backend/src/routers/assets.ts` and `frontend/src/assets/`. The tables keep their
  generic names.
- **The fields:** add columns to `registry_records` in `backend/src/db/schema/registry.ts` and pick them in
  `newRecordSchema`, run `make db/generate NAME=...`, then add them to `columns` in
  `backend/src/services/registry.ts` (import and export), to `AssetForm`, and to the list table if they belong there.
- **The statuses:** `registry_status` in the schema and `statuses` in `frontend/src/assets/format.ts`.
- **The categories:** `defaultCategories` in the service.
- **Whether expiry applies:** drop the Expiring view from `Assets.tsx` and the field from the form.

## Turning the asset register into a sibling

**A license or document expiry tracker.** Rename to licenses. Make the expiry date required (`.notNull()` on
`expires_on`, then generate a migration), make Expiring the first view, and rename the tag to a license or document
number. Statuses become active, renewing and lapsed.

**A vendor list.** Rename to vendors. Replace tag and owner with contact name, email and phone, and the categories
with what the vendors supply. Drop expiry, or keep it for a contract end date.

**Contacts.** The `customers` shape already holds people and businesses with email, phone and address, and
invoices, deals and bookings point at it. Use `customers` for the people a business sells to or books, so they
are shared with those shapes. Use this shape for a directory that stands apart from sales (staff, suppliers'
people, an association's members) where categories, statuses, search, import and paging matter. If a project needs
both, keep `customers` and add search and paging to it rather than keeping two lists of people.

**An employee directory, a product catalog, a property and unit list.** The same steps: rename, swap the fields,
set the categories and statuses. A unit list that needs a unit to belong to a property is a second table with a
reference, not a category.

## Limits

- **Search** is a substring `ILIKE`, which cannot use an index, so it reads every row. That is fast into the tens
  of thousands. Past that, a trigram index needs the `pg_trgm` extension, which a generated migration cannot
  create.
- **Paging** uses an offset, which reads every skipped row. That is fine for hundreds of pages; switch to keyset
  paging (after the last row's sort value and id) if people page that deep.
- **Owner** is free text, because without sign-in there is no users table to point at.
- **Attachments** are not built. They wait for the shared file upload building block (schmeide/template#34),
  which needs storage and an upload path.
- Categories cannot be renamed or deleted.
- Export builds the whole file in memory, which suits tens of thousands of rows.
