import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../csv.ts";

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(
      toCsv([
        ["a", "b"],
        [1, null],
      ])
    ).toBe("a,b\r\n1,\r\n");
  });

  it.each([
    ["a comma", "a,b", '"a,b"'],
    ["a quote", 'say "hi"', '"say ""hi"""'],
    ["a newline", "one\ntwo", '"one\ntwo"'],
    ["a carriage return", "one\rtwo", '"one\rtwo"'],
    ["plain text", "plain", "plain"],
  ])("quotes %s", (_label, cell, expected) => {
    expect(toCsv([[cell]])).toBe(`${expected}\r\n`);
  });

  it.each([
    ["=", "=SUM(A1:A2)", "'=SUM(A1:A2)"],
    ["+", "+1", "'+1"],
    ["-", "-1", "'-1"],
    ["@", "@cmd", "'@cmd"],
    ["a tab", "\tx", "'\tx"],
    ["a formula with a comma", "=A1,B1", `"'=A1,B1"`],
  ])("defuses text starting with %s", (_label, cell, expected) => {
    expect(toCsv([[cell]])).toBe(`${expected}\r\n`);
  });

  it("leaves numbers alone, negative ones included", () => {
    expect(toCsv([[-5, 3]])).toBe("-5,3\r\n");
  });
});

describe("parseCsv", () => {
  it("splits rows on CRLF or LF and cells on commas", () => {
    expect(parseCsv("a,b\r\nc,d\ne,f\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("reads the last row without a trailing newline", () => {
    expect(parseCsv("a,b\nc,")).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });

  it("reads quoted cells holding commas, doubled quotes and line breaks", () => {
    expect(parseCsv('"a,b","say ""hi""","one\r\ntwo"\r\nx,"",y')).toEqual([
      ["a,b", 'say "hi"', "one\r\ntwo"],
      ["x", "", "y"],
    ]);
  });

  it("drops a byte order mark", () => {
    expect(parseCsv("\uFEFFName\nBolt")).toEqual([["Name"], ["Bolt"]]);
  });

  it("keeps a blank line as one empty cell and reads an empty file as no rows", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], [""], ["b"]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("reads back what toCsv writes", () => {
    const rows = [
      ["Name", "Note"],
      ["Desk, oak", 'The "big" one\nby the window'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("rejects an unclosed quote and names the row it opened on", () => {
    expect(() => parseCsv('a\nb\n"c,d\ne')).toThrow("A quote opened on row 3 is never closed");
  });
});
