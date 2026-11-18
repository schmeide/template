import { currencyDigits, formatMoney, formatScaled, parseScaled } from "../money.ts";

describe("money", () => {
  it.each([
    ["12.34", 2, 1234],
    ["12.3", 2, 1230],
    ["12", 2, 1200],
    [".5", 2, 50],
    ["-4.05", 2, -405],
    [" 7 ", 0, 7],
    ["1.25", 3, 1250],
    ["0.07", 2, 7],
  ])("parses %j at %i places as %i", (text, places, expected) => {
    expect(parseScaled(text, places)).toBe(expected);
  });

  it.each([
    ["", 2],
    [".", 2],
    ["1.234", 2],
    ["1.5", 0],
    ["1,5", 2],
    ["abc", 2],
    ["99999999999999999", 2],
  ])("rejects %j at %i places", (text, places) => {
    expect(parseScaled(text, places)).toBeUndefined();
  });

  it.each([
    [1234, 2, "12.34"],
    [1200, 2, "12"],
    [1250, 3, "1.25"],
    [-405, 2, "-4.05"],
    [7, 2, "0.07"],
    [7, 0, "7"],
  ])("formats %i at %i places as %j", (value, places, expected) => {
    expect(formatScaled(value, places)).toBe(expected);
  });

  it("knows each currency's minor digits", () => {
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("BHD")).toBe(3);
  });

  it("formats minor units as currency", () => {
    expect(formatMoney(123_456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(-500, "JPY", "en-US")).toBe("-¥500");
  });
});
