# App shapes

Most small-business apps are one of a few recurring shapes: a line-item document (invoices, quotes), a pipeline (CRM,
tickets), a scheduler (bookings), and so on. This template holds a working feature set for each shape, so a new project
starts from code that already runs instead of from a blank page.

This file records how shapes work and why. It lives in `shapes/`, which a project does not have, so everything here is
about working on the template itself.

## How it works

- **Every shape is real code in the normal layout.** A shape's tables, services, routers, and pages sit in
  `backend/src/` and `frontend/src/` like any feature. The template is one app with every shape in it, so `make serve`,
  `make test`, and `make check` cover all of them together.
- **A manifest names what a shape owns.** `shapes/<name>.shape.json` lists its files, its sub-routers, its pages, its
  slot views, and the shapes it requires.
- **A project is made by pruning.** `make shape/keep NAMES="invoices portal"` keeps those shapes and what they require,
  deletes every other shape's files, rewrites the two registries (`backend/src/router.ts` and `frontend/src/pages.ts`),
  replaces the migrations with one `0000_init` for the tables that are left, and deletes `shapes/`. What remains is an
  ordinary project with no trace of the mechanism.
- **A recipe names the shapes for a trade.** `shapes/<name>.recipe.json` lists the shapes a trade-specific app keeps,
  and `docs/recipes/<name>.md` says what each becomes and how they link. `make shape/keep RECIPE=field-service` keeps
  them; `make shape/recipes` lists the recipes.
- **CI proves each shape stands alone.** `make shape/check` copies the repo, keeps one shape, and runs `make check`,
  `make test`, and `make build` in the copy, for every shape in turn, then the same for every recipe.

## Decisions

### Where a shape lives: in place, as part of one app

Shapes are not separate directories, branches, or repos. Kept apart, a shape cannot be type-checked, tested, or run
where it sits, a base change has to be carried to every copy, and two shapes can only be combined by merging. In place,
the usual tools work on shape code, and all shapes are tested together on every commit.

The cost is that making a project deletes code instead of adding it. Deleting whole files is simple and safe to check,
which is why the rule below matters.

### One rule: a shape lives in its own files

A shape never puts code in a file it does not own, except its one line in each registry. Pruning deletes whole files
and regenerates the registries; it never edits inside a file. The registries are generated, so do not edit them by
hand: change the manifest and run `make shape/registries`. `make shape/check` fails if they are out of date.

### How a project gets a shape

The platform copies the template, runs `make shape/keep NAMES="..."`, and commits. The first name is the home page;
menu order follows the order given, with required shapes after the ones that need them.

A project with no fitting shape keeps `notes`, the sample, as before. At least one shape with a page must be kept: a
frontend with no pages has nothing to show, and a backend with no tables has no migrations to run. A shape with no
page (a building block such as `csv`) is never kept alone; `shape/keep` refuses and names the shapes that require it.

Adding a shape to a project that already holds data is out of scope: `shape/keep` runs once, on a fresh copy.

### Combining shapes, and shared tables

Shapes combine because they already live in one app. A table two shapes need (customers, say) goes in a shape of its
own that both list under `requires`. It is defined once and kept whenever either is kept. Nobody picks such a shape
directly; it is still just a shape.

A link between two shapes (a quote converts to an invoice) is also a shape: it requires both and owns the files for the
link. See below for how its view reaches their pages.

### How a link's view reaches pages it does not own: slots

A link usually belongs on the joined shapes' own screens: "Make invoice" on a quote, "Book a visit" on a job. A page of
its own would move it away from the record it is about, and the joined page cannot link to that page without naming a
shape that may be pruned. So a page exposes a **slot**, and a link shape fills it.

- **The page names the place.** A shape renders `<Slots name="quote" id={id} />` (from `frontend/src/App.tsx`) where
  other shapes may add to its view. The name is the record whose id it passes: `quote`, `invoice`, `deal`. The
  shape's doc lists its slots. With nothing in a slot it renders nothing, so the page needs no change when a link is
  pruned.
- **The link shape fills it.** Its manifest lists `slots`, one entry per view:
  `{ "slot": "quote", "name": "QuoteConversion", "from": "./conversions/Conversion.tsx" }`. The view takes only
  `{ id }` and fetches the rest itself through its own router, or through the joined shape's router, which it may
  call because it requires that shape. Reading the page's own query (for example `trpc.quotes.get`) shares its cache,
  so the view follows the page's changes without the page knowing about it.
- **The registry carries them.** `make shape/registries` writes the views into `slots` in `frontend/src/pages.ts`,
  beside `pages`, and `main.tsx` hands them to `App`, which provides them to every `<Slots>`. Pruning regenerates
  `slots` like `pages`, so a project with no link shape has `slots = []`.
- **A link shape has no page of its own** unless it needs one, so `routers` and `slots` are usually its only registry
  lines. A link with no page is still kept alone and checked: `make shape/list` includes every shape whose required
  shapes have a page.

Adding a slot to a shape is a change to that shape, made when the first link needs it: one `<Slots>` line on the page
and a line in its doc. Do not add slots ahead of need. `quote-invoice`, the first link, added the `quote` and
`invoice` slots to the invoices shape.

The template keeps a normal migration history for development. Projects never see it, so migrations from different
shapes cannot collide.

### Shared building blocks

Code that more than one shape needs (money, line items, PDF, email, file upload) follows the same rule as a shared
table: a shape of its own that the others require. Do not create one ahead of need. The first shape to need something
owns it; when a second shape needs it, move it into its own shape in that change. That keeps the "no abstraction with a
single implementation" rule.

A building block usually has no page and often no tables. `make shape/list` leaves such shapes out, so `shape/check`
does not run one alone; it is checked with every shape that requires it. (A link shape also has no page, but what it
requires does, so it is listed and checked alone.) `csv` (owned by `stock` until `assets` also
needed it) is the first; `money` (from `invoices`) and `ratelimit` (from `requests`) moved out when `orders` needed
them, and `people` (the "acting as" names, from `requests`) when `handbook` did. A building block may have tables
and a router, as `people` does; it still has no page.

### How a shape becomes a named app

By edits, not configuration. Quotes and invoices are the same shape with different names, fields, and statuses. A shape
does not read settings to decide which it is, because project code belongs to the project and agents change it
directly; a settings layer would be an abstraction every later change has to work around.

Instead each shape ships `docs/shapes/<name>.md`, listed in its manifest so it stays in projects that keep the shape.
It says what the shape is, what usually varies (names, fields, statuses), and the short list of changes that turn it
into each sibling app. Where one project commonly needs two siblings at once, the shape models that as data (a document
type column), and its doc says so.

### Recipes for trade-specific apps

People ask for an app for their trade (field service, an agency, a salon), not for a shape. A recipe answers that in
two parts and nothing more:

- `shapes/<name>.recipe.json`: a title and the shapes to keep, in menu order, the first being the home page:

  ```json
  { "title": "Field service", "shapes": ["deals", "bookings", "invoices", "requests"] }
  ```

  It is read with the manifests and checked with them: every name is a shape, none repeats, and the list makes a
  project `shape/keep` accepts. It may name a shape with no page (a link shape, say) beside one with a page.

- `docs/recipes/<name>.md`: what each shape becomes, linking the steps in its shape doc rather than repeating them;
  the links between the shapes; the names to change and the fields to add; and what the trade needs that no shape
  covers yet.

A recipe only chooses shapes. Renames, fields and settings stay edits described in its doc, for the same reason a
shape has no settings layer (see above). A recipe that needs a shape twice (two boards, two calendars) does not get
it: its doc says how one shape covers both, or lists the second under "not covered yet".

**A project made from a recipe keeps that recipe's doc**, and every other recipe doc is deleted. The doc lists the
edits still to make and the links not yet built, which is what the next person or agent in that project needs, and a
project made by `NAMES` keeps no recipe doc at all. So `shape/keep` deletes `docs/recipes/<name>.md` for every recipe
but the one it was given. Recipe files themselves live in `shapes/` and go with it.

The links a recipe describes are shapes of their own (see above). A recipe ships before its links are built; its doc
names each link's issue, and staff carry the details across by hand until then. Once a link is built, the recipes that
use it name it in their shapes, after the shapes it joins.

### Keeping shapes green

- The template's own CI runs every shape together.
- `make shape/check` runs each shape alone, which catches a shape that uses another without requiring it.
- `make shape/check` also runs each recipe, kept with `RECIPE=`, so CI proves every recipe's project checks, tests and
  builds. `make shape/check NAMES="a b"` or `RECIPE=name` checks one case.

### Sign-in

Until the platform supplies sign-in, a shape treats every visitor as one trusted member of staff and ships without
roles. A shape that must tell people apart cannot be finished before then: the portal waits for it, and request and
approval ships with a plain "acting as" choice marked `ponytail:`.

## Adding a shape

1. Build the feature the usual way (see `AGENTS.md`), test-first, in its own files.
2. Add `shapes/<name>.shape.json`:

   ```json
   {
     "requires": [],
     "files": ["backend/src/db/schema/notes.ts", "frontend/src/notes/"],
     "routers": [{ "key": "notes", "name": "notesRouter", "from": "./routers/notes.ts" }],
     "pages": [{ "path": "notes", "title": "Notes", "name": "Notes", "from": "./notes/Notes.tsx" }]
   }
   ```

   `files` takes files or directories (end a directory with `/`) and must cover everything the shape owns, tests and
   its doc included. `from` is relative to the registry: `backend/src/` for routers, `frontend/src/` for pages and
   slots. A link shape adds `"slots": [{ "slot": "quote", "name": "QuoteConversion", "from": "./..." }]` (see
   [How a link's view reaches pages it does not own](#how-a-links-view-reaches-pages-it-does-not-own-slots)).

3. Run `make shape/registries`, then `make db/generate NAME=create_<name>`.
4. Write `docs/shapes/<name>.md`.
5. Run `make check`, `make test`, `make build`, and `make shape/check`.

## Adding a recipe

1. Add `shapes/<name>.recipe.json` with a title and the shapes, home page first. `make shape/recipes` lists it.
2. Write `docs/recipes/<name>.md` as the others are written. File an issue for each link it needs that has none.
3. Run `make shape/check RECIPE=<name>`.

## Limits

- `shape/check` runs its cases one after another, each with its own `npm ci`: eleven shapes and three
  recipes took about eight minutes on a laptop with a warm npm cache. That is well inside the CI job's six-hour limit
  but the slowest step; move it to a CI matrix over `shape/list` and `shape/recipes` when it gets in the way.
- A manifest is trusted to list every file its shape owns. A file left out stays in every project.
