// RFC 4180 CSV: comma-separated, CRLF line ends, and a cell holding a comma, quote or line break
// wrapped in quotes with its quotes doubled.
export type Cell = string | number | null;

// A spreadsheet runs text starting with one of these as a formula, so such text gets a leading
// apostrophe and stays text. Numbers are written as they are, negative ones included.
const formulaStart = /^[=+\-@\t\r]/;

const cell = (value: Cell): string => {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = formulaStart.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: readonly (readonly Cell[])[]): string =>
  rows.map((row) => `${row.map(cell).join(",")}\r\n`).join("");
