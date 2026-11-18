import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { dashboardSales } from "../../db/schema/dashboard.ts";
import {
  breakdownCsv,
  listCategories,
  revenueByCategory,
  revenueSeries,
  salesTotals,
  sampleSales,
  seriesCsv,
} from "../dashboard.ts";

// Tests share one database, so each records sales under its own category and filters by it.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const record = async (sales: readonly (readonly [soldOn: string, amount: number])[]) => {
  const category = randomUUID();
  await db
    .insert(dashboardSales)
    .values(sales.map(([soldOn, amount]) => ({ soldOn, amount, category })));
  return category;
};

describe("dashboard metrics", () => {
  it("includes the first and last day of the range and leaves the days around it out", async () => {
    const category = await record([
      ["2024-01-31", 1],
      ["2024-02-01", 10],
      ["2024-02-29", 20],
      ["2024-03-01", 100],
    ]);

    expect(await salesTotals(db, { from: "2024-02-01", to: "2024-02-29", category })).toEqual({
      revenue: 30,
      sales: 2,
      average: 15,
    });
  });

  it("counts a leap day in February and its month", async () => {
    const category = await record([["2024-02-29", 500]]);

    const february = await revenueSeries(db, { from: "2024-02-01", to: "2024-02-29", category });

    expect(february.unit).toBe("day");
    expect(february.points).toHaveLength(29);
    expect(february.points.at(-1)).toEqual({ period: "2024-02-29", revenue: 500, sales: 1 });
  });

  it("rolls days over a year end and fills days with no sales with zero", async () => {
    const category = await record([
      ["2023-12-30", 5],
      ["2024-01-02", 7],
    ]);

    const series = await revenueSeries(db, { from: "2023-12-30", to: "2024-01-02", category });

    expect(series.points).toEqual([
      { period: "2023-12-30", revenue: 5, sales: 1 },
      { period: "2023-12-31", revenue: 0, sales: 0 },
      { period: "2024-01-01", revenue: 0, sales: 0 },
      { period: "2024-01-02", revenue: 7, sales: 1 },
    ]);
  });

  it("groups a long range by month, over a year end, with empty months as zero", async () => {
    const category = await record([
      ["2023-11-15", 3],
      ["2023-11-30", 4],
      ["2024-02-29", 9],
    ]);

    const series = await revenueSeries(db, { from: "2023-11-01", to: "2024-02-29", category });

    expect(series.unit).toBe("month");
    expect(series.points).toEqual([
      { period: "2023-11", revenue: 7, sales: 2 },
      { period: "2023-12", revenue: 0, sales: 0 },
      { period: "2024-01", revenue: 0, sales: 0 },
      { period: "2024-02", revenue: 9, sales: 1 },
    ]);
  });

  it("answers an empty range with zeros, not gaps", async () => {
    const category = randomUUID();
    const range = { from: "2025-06-01", to: "2025-06-03", category };

    expect(await salesTotals(db, range)).toEqual({ revenue: 0, sales: 0, average: 0 });
    expect((await revenueSeries(db, range)).points.map((point) => point.revenue)).toEqual([
      0, 0, 0,
    ]);
    expect(await revenueByCategory(db, range)).toEqual([]);
  });

  it("breaks revenue down by category and exports both tables as CSV", async () => {
    const category = await record([
      ["2025-05-01", 1250],
      ["2025-05-02", 750],
    ]);
    const range = { from: "2025-05-01", to: "2025-05-02", category };

    expect(await revenueByCategory(db, range)).toEqual([{ category, revenue: 2000, sales: 2 }]);
    expect(await breakdownCsv(db, range)).toBe(`Category,Sales,Revenue\r\n${category},2,20\r\n`);
    expect(await seriesCsv(db, range)).toBe(
      "Period,Sales,Revenue\r\n2025-05-01,1,12.5\r\n2025-05-02,1,7.5\r\n"
    );
  });
});

describe("dashboard sample data", () => {
  it("covers the year up to today in several categories", () => {
    const sales = sampleSales("2026-03-01");

    expect(new Set(sales.map((sale) => sale.category)).size).toBeGreaterThan(1);
    expect(sales.every((sale) => sale.amount > 0)).toBe(true);
    expect(sales.every((sale) => sale.soldOn > "2025-03-01" && sale.soldOn <= "2026-03-01")).toBe(
      true
    );
    expect(sales.some((sale) => sale.soldOn === "2026-03-01")).toBe(true);
  });

  it("fills an empty table with the sample before the first read", async () => {
    expect((await listCategories(db)).length).toBeGreaterThan(0);
  });
});
