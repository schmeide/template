import { presets } from "../range.ts";

const byKey = (today: string) =>
  Object.fromEntries(presets(today).map(({ key, from, to }) => [key, [from, to]]));

describe("presets", () => {
  it("runs this month and the year to today, and last month whole", () => {
    expect(byKey("2026-11-17")).toEqual({
      month: ["2026-11-01", "2026-11-17"],
      lastMonth: ["2026-10-01", "2026-10-31"],
      year: ["2026-01-01", "2026-11-17"],
    });
  });

  it("takes last month from the year before in January", () => {
    expect(byKey("2026-01-01")).toMatchObject({
      month: ["2026-01-01", "2026-01-01"],
      lastMonth: ["2025-12-01", "2025-12-31"],
      year: ["2026-01-01", "2026-01-01"],
    });
  });

  it("ends February on the leap day in a leap year only", () => {
    expect(byKey("2024-03-31").lastMonth).toEqual(["2024-02-01", "2024-02-29"]);
    expect(byKey("2023-03-01").lastMonth).toEqual(["2023-02-01", "2023-02-28"]);
  });
});
