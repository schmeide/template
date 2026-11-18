# Handbook

Pages of written knowledge, with search and optional read tracking. An SOP wiki, a policy handbook and a training
tracker are the same shape: a training tracker is a handbook whose pages all ask to be confirmed.

## What it has

- **Pages** (`handbook_pages`): title, body in Markdown (up to 100,000 characters), section, position within the
  section, whether reads are tracked, version, updated at and updated by. A database with no pages gets
  `defaultPages` from `backend/src/services/handbook.ts` (a welcome page about writing pages) the first time the
  contents load.
- **Contents** (`#/handbook`): every page under its section, with Up and Down buttons to reorder pages within a
  section, and search.
- **Page** (`#/handbook/<id>`): the rendered page, who changed it last and when, and read confirmations when tracked.
- **Editor** (`#/handbook/new`, `#/handbook/<id>/edit`): title, section (free text, suggesting existing ones), body,
  and "Ask people to confirm they have read it", with a preview beside the body rendered by the same code as the page.
- **Reads** (`handbook_reads`): per page and person, the version last confirmed and when.
- **People** come from the `people` shape, which this one requires: the "Acting as" picker at the top of every
  Handbook view. Writing a page or confirming a read needs a name; reading does not.

## The rules

- **Sections** are one level: a section holds pages, and pages do not nest. A section is the text on its pages, so it
  exists while a page uses it and is renamed by editing its pages. Sections are listed by name (prefix them with
  numbers to order them); pages without one are listed under "Other pages".
- **Positions** are 1, 2, 3 within a section. A new page, or one moved to another section, goes to the end. Every
  write that changes positions takes a table lock, so writes queue and positions never collide; a move numbers the
  whole section again, which also repairs any gap. Reads are never blocked.
- **Versions.** A change to the title or body adds one to the version. A change to the section or the tracking
  setting does not. Each save carries the version the editor started from; if the page has changed since, the save is
  refused with `CONFLICT` and nothing is overwritten.
- **Read tracking.** A read is of one version. When the text changes, everyone's confirmation is out of date and the
  page asks them again; the page lists who has not read the current version, marking those who read an earlier one.
  A confirmation of a version that is no longer current is refused, so nobody confirms text they were not shown.
  **A confirmation is only as trustworthy as the "Acting as" choice** until platform sign-in exists
  (schmeide/schmeide.app#84); see [people.md](people.md).
- **Search** is Postgres full-text search over a generated `tsvector` column (`search`) with a GIN index: English
  stemming, title words ranked above body words, every word required, and each word also matching as the start of a
  longer one ("polic" finds "policies"). Only letters and digits from the query are used, so search syntax typed in
  is ignored. At most 50 results.

## Markdown

`frontend/src/handbook/markdown.tsx` renders a small subset into React elements. It never sets HTML, so markup in a
page is shown as text and cannot run, and links go only to `http:`, `https:`, `mailto:` and the app's own `#/`
pages; any other link (`javascript:`, `data:`, relative paths) is shown as text.

Supported: `#` headings (rendered one level down, under the page title), paragraphs, `**strong**`, `*emphasis*`,
`` `code` ``, fenced code blocks, `-`, `*` or `+` lists and `1.` lists, `>` quotes, and `[links](https://...)`.

Not supported, shown as typed: raw HTML, images, tables, nested lists, `_underscore_` emphasis, setext headings,
indented code blocks, reference links, autolinks, hard line breaks and link titles. For more, replace it with a
CommonMark library and an HTML sanitizer (both new dependencies, so agree that first).

## What usually varies

- **Policy handbook:** turn on read tracking for each policy.
- **Training tracker:** default `trackReads` to true in the editor, and add a view listing each person's unread pages.
- **SOP wiki:** read tracking off; sections per area of work.
- Whether read tracking is offered at all: remove `Reads` from `PageView.tsx`, the checkbox, `confirmRead`, and the
  `handbook_reads` table, then `make db/generate NAME=drop_handbook_reads`.

## Limits

- Pages are not deleted. Move an old page to an "Archive" section instead.
- No history of earlier versions, only the version number; keep old text in the page if it must stay readable.
- The read list shows every name in `approval_people`; filter it to a team once there are teams.
- Two people editing at once: the second save is refused and must reload, there is no merge.
- Nobody is told when a page needs reading; that needs email.
