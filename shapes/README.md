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
- **A manifest names what a shape owns.** `shapes/<name>.shape.json` lists its files, its sub-routers, its pages, and
  the shapes it requires.
- **A project is made by pruning.** `make shape/keep NAMES="invoices portal"` keeps those shapes and what they require,
  deletes every other shape's files, rewrites the two registries (`backend/src/router.ts` and `frontend/src/pages.ts`),
  replaces the migrations with one `0000_init` for the tables that are left, and deletes `shapes/`. What remains is an
  ordinary project with no trace of the mechanism.
- **CI proves each shape stands alone.** `make shape/check` copies the repo, keeps one shape, and runs `make check`,
  `make test`, and `make build` in the copy, for every shape in turn.

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

A project with no fitting shape keeps `notes`, the sample, as before. At least one shape must be kept: a backend with
no tables has no migrations to run.

Adding a shape to a project that already holds data is out of scope: `shape/keep` runs once, on a fresh copy.

### Combining shapes, and shared tables

Shapes combine because they already live in one app. A table two shapes need (customers, say) goes in a shape of its
own that both list under `requires`. It is defined once and kept whenever either is kept. Nobody picks such a shape
directly; it is still just a shape.

A link between two shapes (a quote converts to an invoice) is also a shape: it requires both and owns the files for the
link.

The template keeps a normal migration history for development. Projects never see it, so migrations from different
shapes cannot collide.

### Shared building blocks

Code that more than one shape needs (money, line items, PDF, email, file upload) follows the same rule as a shared
table: a shape of its own that the others require. Do not create one ahead of need. The first shape to need something
owns it; when a second shape needs it, move it into its own shape in that change. That keeps the "no abstraction with a
single implementation" rule.

### How a shape becomes a named app

By edits, not configuration. Quotes and invoices are the same shape with different names, fields, and statuses. A shape
does not read settings to decide which it is, because project code belongs to the project and agents change it
directly; a settings layer would be an abstraction every later change has to work around.

Instead each shape ships `docs/shapes/<name>.md`, listed in its manifest so it stays in projects that keep the shape.
It says what the shape is, what usually varies (names, fields, statuses), and the short list of changes that turn it
into each sibling app. Where one project commonly needs two siblings at once, the shape models that as data (a document
type column), and its doc says so.

### Keeping shapes green

- The template's own CI runs every shape together.
- `make shape/check` runs each shape alone, which catches a shape that uses another without requiring it.
- `make shape/check NAMES="a b"` checks one combination. When recipes for trade-specific apps exist, CI runs it for
  each recipe.

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
   its doc included. `from` is relative to the registry: `backend/src/` for routers, `frontend/src/` for pages.

3. Run `make shape/registries`, then `make db/generate NAME=create_<name>`.
4. Write `docs/shapes/<name>.md`.
5. Run `make check`, `make test`, `make build`, and `make shape/check`.

## Limits

- `shape/check` runs its cases one after another, each with its own `npm ci`. Move it to a CI matrix when that is slow.
- A manifest is trusted to list every file its shape owns. A file left out stays in every project.
