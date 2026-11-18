import { describe, expect, it } from "vitest";
import { toCsv } from "../csv.ts";

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
