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

export class CsvError extends Error {
  readonly row: number;
  constructor(row: number) {
    super(`A quote opened on row ${row} is never closed`);
    this.row = row;
  }
}

// Reads CSV as toCsv writes it, and also LF or lone CR line ends, a byte order mark, and a last row
// with no line end. A blank line is a row of one empty cell. A quote is special only at the start
// of a cell; one opened and never closed is an error naming the row it opened on.
export const parseCsv = (text: string): readonly (readonly string[])[] => {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: (readonly string[])[] = [];
  let row: string[] = [];
  let cell = "";
  let started = false;
  let quotedFrom = 0;
  const endRow = () => {
    rows.push([...row, cell]);
    row = [];
    cell = "";
    started = false;
  };
  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (quotedFrom > 0) {
      if (char !== '"') cell += char;
      else if (source[at + 1] === '"') {
        cell += '"';
        at++;
      } else quotedFrom = 0;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[at + 1] === "\n") at++;
      endRow();
      continue;
    }
    started = true;
    if (char === '"' && cell === "") quotedFrom = rows.length + 1;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else cell += char;
  }
  if (quotedFrom > 0) throw new CsvError(quotedFrom);
  if (started) endRow();
  return rows;
};
