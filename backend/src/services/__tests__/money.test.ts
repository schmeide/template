import { describe, expect, it } from "vitest";
import { lineAmounts, totals } from "../money.ts";

// quantity is in thousandths, unitPrice in minor units, taxRate in basis points.
describe("money", () => {
  it.each([
    ["one unit", { quantity: 1000, unitPrice: 1999, taxRate: 0 }, { net: 1999, tax: 0 }],
    [
      "a half cent rounds away from zero",
      { quantity: 1500, unitPrice: 333, taxRate: 0 },
      { net: 500, tax: 0 },
    ],
    [
      "a negative half cent rounds away from zero",
      { quantity: 2500, unitPrice: -333, taxRate: 0 },
      { net: -833, tax: 0 },
    ],
    ["below half rounds down", { quantity: 1, unitPrice: 499, taxRate: 0 }, { net: 0, tax: 0 }],
    [
      "tax at a half cent rounds up",
      { quantity: 1000, unitPrice: 1005, taxRate: 1000 },
      { net: 1005, tax: 101 },
    ],
    [
      "tax at a fractional rate",
      { quantity: 1000, unitPrice: 1999, taxRate: 875 },
      { net: 1999, tax: 175 },
    ],
    [
      "tax on a discount",
      { quantity: 1000, unitPrice: -1005, taxRate: 1000 },
      { net: -1005, tax: -101 },
    ],
    [
      "amounts past float precision stay exact",
      { quantity: 999_999_999, unitPrice: 9_999_999, taxRate: 0 },
      { net: 9_999_998_990_000, tax: 0 },
    ],
  ])("%s", (_label, line, expected) => {
    expect(lineAmounts(line)).toEqual(expected);
  });

  it("totals the lines, rounding tax per line", () => {
    const half = { quantity: 1000, unitPrice: 5, taxRate: 1000 };

    expect(totals([half, half, { quantity: 2000, unitPrice: 1250, taxRate: 0 }])).toEqual({
      subtotal: 2510,
      tax: 2,
      total: 2512,
    });
  });

  it("totals no lines as zero", () => {
    expect(totals([])).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});
