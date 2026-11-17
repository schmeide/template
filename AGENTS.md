# `AGENTS.md`

## Purpose

These instructions tell coding agents how to work in this repository.

This is a Schmeide project: a TypeScript web app with a React + Vite frontend
and a Fastify + tRPC + Drizzle backend on Postgres, in one repository as npm
workspaces (`frontend/`, `backend/`). It starts with working features; build
new ones the same way.

If a `shapes/` directory exists, you are in the template itself, not in a
project. Read `shapes/README.md` before changing anything: every feature there
belongs to a shape, and a project is made by keeping some shapes and deleting
the rest.

## Building a feature (start here)

- If the notes feature is present, it is a sample that proves every layer
  works. Replace it with the project's real features: delete its table,
  service, router, page, and tests once a real feature exists, and generate a
  migration that drops it.
- A new feature goes through the same layers, one file or entry per layer:
  1. Table and derived Zod schemas in `backend/src/db/schema/<feature>.ts`,
     then `make db/generate NAME=create_<feature>`.
  2. Business logic in `backend/src/services/<feature>.ts`, with a test in
     `backend/src/services/__tests__/<feature>.test.ts`.
  3. A sub-router in `backend/src/routers/<feature>.ts`, with a test in
     `backend/src/routers/__tests__/<feature>.test.ts`, and one line for it in
     `backend/src/router.ts`.
  4. Page components in `frontend/src/<feature>/`, with tests in
     `frontend/src/<feature>/__tests__/`, and one entry per page in
     `frontend/src/pages.ts`.
- Before finishing, `make check`, `make test`, and `make build` must all pass,
  and `make format` must leave no diff.

## Key rule (always)

- Respect the linting and formatting conventions of the various linting and
  formatting configurations and tools being used.
- The configs are the source of truth: `eslint.config.ts`, `.prettierrc`,
  `.prettierignore`, `.markdownlint.yaml`, the workspace `tsconfig.json` files,
  and the Vitest/Vite configs. Do not override them inline (no blanket
  `eslint-disable`, no `any`, no `@ts-ignore`) to make a change pass.
- The stack is fixed. Do not swap or add a framework, ORM, router library,
  state library, or CSS framework.

## Use Makefile targets

- Use the Makefile targets rather than crafting your own shell commands. If an
  action needs to be repeatable, add a target for it.
- `make help` lists every target and is the default goal.

| Target                    | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `make test`               | Throwaway Postgres, migrate, run all tests, tear down     |
| `make check`              | ESLint, `tsc` for both workspaces, Prettier, markdownlint |
| `make build`              | Typecheck and bundle `frontend/dist`                      |
| `make fix`                | Apply ESLint, Prettier, and markdownlint fixes            |
| `make db/generate NAME=x` | Generate a migration from `backend/src/db/schema/`        |
| `make db/migrate`         | Apply migrations to `$DATABASE_URL`                       |
| `make serve` / `make up`  | Run the app (the developer or platform does this)         |

## Development assumptions

- Never start, stop, or restart the backend, the Vite dev server, or the
  Compose stack (`make serve`, `make up`, `make down`). Assume the developer is
  running `make serve`, which hot-reloads.
- Running `make test`, `make check`, and `make build` is expected.

## Structure (follow this)

- `backend/src/db/schema/<feature>.ts`: Drizzle tables and the Zod schemas
  derived from them with `drizzle-zod`, plus their inferred types. One file per
  feature; drizzle-kit reads the whole directory.
- `backend/src/services/<feature>.ts`: business logic. Plain functions that take
  `db` as their first parameter. No HTTP or tRPC types here.
- `backend/src/routers/<feature>.ts`: the feature's tRPC sub-router, built with
  `router` and `procedure` from `backend/src/trpc.ts`.
- `backend/src/router.ts`: the app router. One line per feature
  (`notes: notesRouter`) and nothing else.
- `backend/src/app.ts`: Fastify wiring, including `/healthz` and
  `/api/healthz`. `server.ts` (the entry point) and `migrate.ts` are the only
  places that read environment variables.
- `backend/drizzle/`: generated migrations. Commit them; never hand-edit them.
- `frontend/src/<feature>/`: the feature's components, one per page or section,
  using `useTRPC()` with TanStack Query's `useQuery`/`useMutation`.
- `frontend/src/pages.ts`: one entry per page (`path`, `title`, `Component`), in
  menu order. The first entry is the home page.
- `frontend/src/App.tsx`: shows the page named in the address (`#/<path>`) and a
  menu when there is more than one page. No feature content.
- `frontend/src/main.tsx`: providers and the tRPC client. No page content.
- Keep a feature inside its own files. Another feature may import from it, but
  the only shared files a feature touches are `router.ts` and `pages.ts`.
- Tests live in `__tests__/` beside the code: `<name>.test.ts` or `.test.tsx`.

## API and service split

API code only does three things:

1. Extract input (tRPC validates it with the derived Zod schema).
2. Call a service function.
3. Return or shape the result.

Business logic lives in `backend/src/services/` so it is testable without HTTP
and reusable from scripts and jobs.

## Single source of truth: tables, validation, types

- A Drizzle table defines a feature's data. Derive input validation from it with
  `createInsertSchema` / `createSelectSchema` / `createUpdateSchema`, refining
  fields (for example `.trim().min(1)`) rather than writing a parallel Zod
  object by hand.
- Prefer database constraints where they exist: `varchar(n)` yields `.max(n)`
  automatically and is enforced by Postgres too.
- The frontend gets API types only through `import type { AppRouter }` from
  `backend/src/router.ts`. Never import backend runtime code into the frontend
  and never redeclare API types there. There is no shared package; do not add
  one until code genuinely needs to run on both sides.
- Schema change workflow: edit the feature's file in `backend/src/db/schema/`,
  run `make db/generate NAME=...`,
  commit the generated SQL and `meta/` files with the change.

## Test-Driven Development (strongly preferred)

1. Write or update a test that captures the desired behavior.
2. Run it with `make test` and confirm it fails for the right reason.
3. Implement the minimal code to make it pass.
4. Refactor with the tests still passing.

For a pure refactor, run the existing tests before and after.

## Testing rules

- Per feature, keep tests focused: a service test against Postgres, a router
  test (validation and wiring via `appRouter.createCaller`), and a component test
  with Testing Library.
- Backend tests reach Postgres only through `DATABASE_URL`. Never start
  containers from test code (no Testcontainers): in production the checks run in
  a Kubernetes pod with a Postgres sidecar and no Docker daemon, via
  `make test/run`.
- Tests share one database and run in parallel. Do not truncate tables or
  assert on total counts; create rows with unique values (`randomUUID()`) and
  assert on those.
- Component tests use a fake terminating tRPC link (see an existing test under
  `frontend/src/<feature>/__tests__/`), not network mocks. Query by role and
  label, not by class names or DOM structure.

## Code style

- Prefer immutable bindings and types: `const`, `readonly` fields and
  parameters, `as const`. Mutate only when the algorithm requires it.
- Use American spelling in code, comments, and docs.
- Comments are short and only where they earn their place. Mark a deliberate
  shortcut with a `ponytail:` comment that names its limit and upgrade path.
- Keep it minimal: no abstraction with a single implementation, no scaffolding
  for later, no auth or extra libraries unless the feature needs them.
- The backend runs TypeScript directly with Node's type stripping: use `.ts`
  extensions in relative imports and only erasable syntax (no `enum`, no
  parameter properties). `tsconfig` enforces this.

## Markdown

- `.markdownlint.yaml` is the source of truth (120-column wrap). Run `make fix`,
  then reflow long lines by hand.

## Pull request and commit conventions (always follow this)

- The title of a pull request is a conventional commit, in lowercase imperative mood, with the issue number as the
  scope: `feat(<issue number>): add null check`, not `<issue number>: Added null check`. `type` is one of `feat`,
  `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`. The PR title becomes the
  commit subject when the PR is squash-merged, and the PR title workflow fails any other title.
- Include the issue number in the PR body (`Closes #N`).
- Branch names should reflect the issue: `123_short-description`.
- Commits must be signed off (`git commit -s`).
- CI runs `make format` (failing on any diff), `make check`, `make test`, and
  `make build`. Run them before pushing.

## Generated files and environment

- Do not hand-edit generated output: `backend/drizzle/`, `frontend/dist/`,
  `coverage/`, `node_modules/`, or `package-lock.json` (change `package.json`
  and let npm regenerate it).
- Configuration comes from the environment: `DATABASE_URL` and `PORT`.
  Document new variables in `.env.example` and the README. Only
  `VITE_`-prefixed variables reach frontend code, and the bundle is public.

## Deployment contract (do not break)

The platform deploys each project with `make up`, several on one Docker host,
using the variables in the README's "Deploying a copy" section. Keep these true:

- `make up` honors `COMPOSE_PROJECT_NAME` and `WEB_PORT`, and `make down`
  honors `COMPOSE_PROJECT_NAME`. Never set `container_name`, fixed network or
  volume names, or `image` names in `compose.yaml`; Compose scopes them per
  project.
- `web` is the only service in the `make up` stack that publishes a host port.
  Do not add `ports` to `db`, `migrate`, `backend`, or any new service.
- `GET /api/healthz` returns 200 through nginx, and `/` serves the frontend.
- Migrations run inside the stack via the `migrate` service; `backend` waits
  for it. Running `make up` again rebuilds and replaces containers and keeps the
  database volume.
- `make test` honors `TEST_DB_PORT`, and an exported `TEST_DATABASE_URL` replaces
  Compose and Docker; `make test/run` needs only `DATABASE_URL`.
- The images run as non-root numeric users (`web` UID 101 on 8080, `backend`
  UID 1000 on 3000) so they pass Kubernetes `restricted` pod security.
