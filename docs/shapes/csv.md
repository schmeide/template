# CSV

Reading and writing CSV files, for shapes that import or export them. It has no tables and no page: nobody keeps it
on its own, and `make shape/keep` refuses to. It comes with the shapes that require it (`stock` and `assets`).

## What it has

- **`toCsv`** (`backend/src/services/csv.ts`) writes RFC 4180 CSV: CRLF line ends, and a cell holding a comma, quote
  or line break wrapped in quotes with its quotes doubled. Text starting with `=`, `+`, `-`, `@`, tab or carriage
  return gets a leading apostrophe so a spreadsheet does not run it as a formula. Numbers, negative ones included,
  are written as they are.
- **`parseCsv`** (same file) reads what `toCsv` writes, and also LF or lone CR line ends, a byte order mark (Excel
  adds one), and a last row with no line end. A blank line is a row of one empty cell. A quote is special only at
  the start of a cell. A quote that is never closed throws a `CsvError` naming the row it opened on. It does not
  undo the apostrophe `toCsv` adds, so such a cell imports with it.
- **`downloadCsv`** (`frontend/src/csv/download.ts`) saves a CSV string as a file in the browser.

## Limits

- `parseCsv` reads the whole text into memory. That suits the files a person picks in a form; a bulk feed would
  need a streaming parser.
- Comma is the only separator. A spreadsheet set to a locale that writes semicolons needs its export setting
  changed.
