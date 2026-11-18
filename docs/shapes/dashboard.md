# Dashboard

Numbers about the business for a date range: stat tiles, a chart over time and a breakdown table. This shape ships it
as a sales dashboard over a small sample dataset. A KPI dashboard and sales reports are the same shape with different
metrics.

## What it has

- **Sample sales** (`dashboard_sales`): a calendar day, a category and an amount in cents. A database with no rows
  gets a year of made-up sales in three categories, ending today (UTC), the first time a metric is read
  (`sampleSales` in `backend/src/services/dashboard.ts`).
- **Dashboard** (`#/dashboard`): a "Sample data" notice, a date range with presets, a category filter, three stat
  tiles (revenue, number of sales, average sale), a bar chart of revenue over time with the same numbers in a table
  under it, and revenue by category with each category's share. Both tables download as CSV.

**The sample rows show in a real project until the metrics are pointed at its own data.** The page says so in a
notice at the top; remove the notice (`dashboard-sample` in `frontend/src/dashboard/Dashboard.tsx`) in the same
change that repoints the metrics.

## The metrics

Each block on the page is fed by one function in `backend/src/services/dashboard.ts` that takes a range:

| Function            | Feeds                            | Procedure              |
| ------------------- | -------------------------------- | ---------------------- |
| `salesTotals`       | the stat tiles                   | `dashboard.totals`     |
| `revenueSeries`     | the chart and the table under it | `dashboard.series`     |
| `revenueByCategory` | the breakdown table              | `dashboard.breakdown`  |
| `listCategories`    | the category filter              | `dashboard.categories` |

`seriesCsv` and `breakdownCsv` write the two tables through the `csv` shape (`dashboard.exportCsv`). Money is integer
cents, formatted in the browser with the `money` shape's `formatMoney`; the currency is `currency` in
`frontend/src/dashboard/format.ts`. CSV revenue is a plain number in currency units (12.5), which a spreadsheet sums.

## Dates

- A range is two calendar days (`YYYY-MM-DD`), **both included**. Dates are plain days, not instants, so a sale on
  the last day of the range counts whatever the time zone.
- The presets are computed in the browser, in the viewer's time zone: **This month** runs from the first of the
  month to today, **Last month** is the whole previous calendar month (December in January; February ends on the
  29th in a leap year), and **Year to date** runs from 1 January to today (`frontend/src/dashboard/range.ts`).
- The series has a point per day for a range of up to 92 days and per month (`YYYY-MM`) beyond that. Every period in
  the range is there; one with no sales is zero, not left out. The first and last month of a long range may be
  partial.

## Pointing a metric at another shape

A shape may only use another's tables if its manifest requires it. To show money received on invoices in the tiles,
with `invoices` kept:

1. Add `"invoices"` to `requires` in `shapes/dashboard.shape.json`.
2. Rewrite the query in `salesTotals` against the invoices shape's `payments` table (amount in cents, `paid_on` a
   calendar day), keeping its signature and result:

   ```ts
   import { payments } from "../db/schema/documents.ts";

   export const salesTotals = async (db: Db, { from, to }: Readonly<Range>) => {
     const [totals] = await db
       .select({
         revenue: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
         sales: sql<number>`count(*)`.mapWith(Number),
       })
       .from(payments)
       .where(and(gte(payments.paidOn, from), lte(payments.paidOn, to)));
     return {
       ...totals,
       average: totals.sales === 0 ? 0 : Math.round(totals.revenue / totals.sales),
     };
   };
   ```

   Rename the tiles to match ("Received", "Payments"). Decide what the category filter means there (a payment
   method, say) or drop it.

3. Do the same for `revenueSeries` (group by `paid_on` instead of `sold_on`) and `revenueByCategory` (by payment
   method, or by customer through `documents`).
4. Once no metric reads `dashboard_sales`, delete the table, `sampleSales` and `seedIfEmpty`, run
   `make db/generate NAME=drop_dashboard_sample`, and remove the sample notice.
5. Run `make check test build`.

In a project, the manifest is gone; the `requires` step is only for the template.

## What usually varies

- **Which metrics show.** Add a metric as one more service function of a range, one procedure, and one block on the
  page; remove one the same way.
- **The breakdown.** Category here; product, customer, staff member or location elsewhere.
- **The presets.** Add one (last 7 days, last quarter) in `presets`.

## The chart

Drawn as inline SVG with no charting library (`frontend/src/dashboard/Chart.tsx`): bars only, one series. The bars
stretch to the page width; the axis and period labels are HTML so they stay readable. The SVG has a text summary for
screen readers, every bar has a tooltip, and the table under the chart has every number. There is one series, so
color carries no meaning. The app has no dark theme, so the chart has none either.

## Limits

- One currency. A business that sells in several needs a currency column and a total per currency.
- Lines, stacked bars and comparisons with an earlier period are not drawn; draw them the same way when a metric
  needs them.
- The series sums by day in SQL and groups months in JavaScript, fine for years of daily data.
- Sample data is seeded once; the dashboard never reseeds a table that has rows.
