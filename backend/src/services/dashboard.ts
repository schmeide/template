import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { dashboardSales, type Range, type Sale } from "../db/schema/dashboard.ts";
import { toCsv } from "./csv.ts";

// Each metric is one function of a date range. To show a kept shape's numbers instead of the
// sample, rewrite that function's query against the shape's tables (docs/shapes/dashboard.md).

const dayMs = 86_400_000;
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);

const categories = ["Hardware", "Services", "Subscriptions"] as const;

// A year of made-up sales up to `today`, the same every time for the same day.
export const sampleSales = (today: string): readonly Sale[] =>
  Array.from({ length: 365 }, (_, day) => addDays(today, -day)).flatMap((soldOn, day) =>
    categories.flatMap((category, index) =>
      (day + index) % 3 === 0
        ? [{ soldOn, category, amount: 2_000 * (index + 1) + ((day * 37 + index * 11) % 50) * 100 }]
        : []
    )
  );

// An empty table gets the sample, once, under a lock so two first readers do not both add it.
const seedIfEmpty = async (db: Db) => {
  const [any] = await db.select({ id: dashboardSales.id }).from(dashboardSales).limit(1);
  if (any) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${dashboardSales} in exclusive mode`);
    const [{ total }] = await tx.select({ total: count() }).from(dashboardSales);
    // The sample ends today in UTC.
    if (total === 0)
      await tx
        .insert(dashboardSales)
        .values([...sampleSales(new Date().toISOString().slice(0, 10))]);
  });
};

const inRange = ({ from, to, category }: Readonly<Range>) =>
  and(
    gte(dashboardSales.soldOn, from),
    lte(dashboardSales.soldOn, to),
    category === undefined ? undefined : eq(dashboardSales.category, category)
  );

// Postgres sums integers as bigint, which arrives as a string.
const revenue = sql<number>`coalesce(sum(${dashboardSales.amount}), 0)`.mapWith(Number);
const sales = sql<number>`count(*)`.mapWith(Number);

// Every category, for the filter.
export const listCategories = async (db: Db): Promise<readonly string[]> => {
  await seedIfEmpty(db);
  const rows = await db
    .selectDistinct({ category: dashboardSales.category })
    .from(dashboardSales)
    .orderBy(dashboardSales.category);
  return rows.map((row) => row.category);
};

// The stat tiles: revenue, number of sales and the average sale, rounded to the cent.
export const salesTotals = async (db: Db, range: Readonly<Range>) => {
  await seedIfEmpty(db);
  const [totals] = await db.select({ revenue, sales }).from(dashboardSales).where(inRange(range));
  return { ...totals, average: totals.sales === 0 ? 0 : Math.round(totals.revenue / totals.sales) };
};

// Revenue per day, or per month when the range is longer than 92 days. Every period in the range
// is there, with zero when it had no sales. Days are "YYYY-MM-DD" and months "YYYY-MM".
export const revenueSeries = async (db: Db, range: Readonly<Range>) => {
  await seedIfEmpty(db);
  const rows = await db
    .select({ day: dashboardSales.soldOn, revenue, sales })
    .from(dashboardSales)
    .where(inRange(range))
    .groupBy(dashboardSales.soldOn);
  const days = (Date.parse(range.to) - Date.parse(range.from)) / dayMs + 1;
  const unit = days > 92 ? ("month" as const) : ("day" as const);
  const key = (day: string) => (unit === "day" ? day : day.slice(0, 7));
  const periods: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    if (periods.at(-1) !== key(day)) periods.push(key(day));
  }
  const points = periods.map((period) => {
    const inPeriod = rows.filter((row) => key(row.day) === period);
    return {
      period,
      revenue: inPeriod.reduce((sum, row) => sum + row.revenue, 0),
      sales: inPeriod.reduce((sum, row) => sum + row.sales, 0),
    };
  });
  return { unit, points };
};

// Revenue and number of sales per category, largest first.
export const revenueByCategory = async (db: Db, range: Readonly<Range>) => {
  await seedIfEmpty(db);
  return db
    .select({ category: dashboardSales.category, revenue, sales })
    .from(dashboardSales)
    .where(inRange(range))
    .groupBy(dashboardSales.category)
    .orderBy(desc(revenue), dashboardSales.category);
};

// Revenue goes out in currency units as a number (1250 cents is 12.5), which a spreadsheet sums.
const units = (cents: number) => cents / 100;

export const seriesCsv = async (db: Db, range: Readonly<Range>): Promise<string> =>
  toCsv([
    ["Period", "Sales", "Revenue"],
    ...(await revenueSeries(db, range)).points.map((point) => [
      point.period,
      point.sales,
      units(point.revenue),
    ]),
  ]);

export const breakdownCsv = async (db: Db, range: Readonly<Range>): Promise<string> =>
  toCsv([
    ["Category", "Sales", "Revenue"],
    ...(await revenueByCategory(db, range)).map((row) => [
      row.category,
      row.sales,
      units(row.revenue),
    ]),
  ]);
