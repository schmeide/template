import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { downloadCsv } from "../csv/download.ts";
import { useTRPC } from "../trpc.ts";
import { Chart } from "./Chart.tsx";
import { formatCount, formatPeriod, money } from "./format.ts";
import { localDay, presets } from "./range.ts";
import "./dashboard.css";

const share = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

// Sales for a date range: stat tiles, revenue over time as a chart and a table, and revenue by
// category. Each block is fed by one server function of the range.
export function Dashboard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [today] = useState(() => localDay());
  const choices = presets(today);
  const [from, setFrom] = useState(choices[0].from);
  const [to, setTo] = useState(choices[0].to);
  const [category, setCategory] = useState("");
  const valid = from !== "" && to !== "" && from <= to;
  const range = { from, to, ...(category ? { category } : {}) };

  const categories = useQuery(trpc.dashboard.categories.queryOptions());
  const totals = useQuery({ ...trpc.dashboard.totals.queryOptions(range), enabled: valid });
  const series = useQuery({ ...trpc.dashboard.series.queryOptions(range), enabled: valid });
  const breakdown = useQuery({ ...trpc.dashboard.breakdown.queryOptions(range), enabled: valid });
  const exportCsv = useMutation({
    mutationFn: (table: "series" | "breakdown") =>
      queryClient.fetchQuery(trpc.dashboard.exportCsv.queryOptions({ ...range, table })),
    onSuccess: (csv, table) => downloadCsv(csv, `${table}-${from}-to-${to}.csv`),
  });

  const unit = series.data?.unit === "month" ? "month" : "day";
  const seriesTitle = `Revenue by ${unit}`;
  const revenueTotal = breakdown.data?.reduce((sum, row) => sum + row.revenue, 0) ?? 0;
  const error = totals.error ?? series.error ?? breakdown.error ?? categories.error;

  const download = (table: "series" | "breakdown", what: string) => (
    <button type="button" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate(table)}>
      Download CSV <span className="dashboard-hidden">of {what}</span>
    </button>
  );

  return (
    <main className="dashboard">
      <h1>Dashboard</h1>
      <p className="dashboard-sample">
        <strong>Sample data.</strong> These figures are made up so the dashboard is not empty. They
        are not your business&rsquo;s numbers.
      </p>

      <div className="dashboard-controls">
        <div role="group" aria-label="Date range" className="dashboard-presets">
          {choices.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={preset.from === from && preset.to === to}
              onClick={() => {
                setFrom(preset.from);
                setTo(preset.to);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          Category{" "}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.data?.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!valid && <p role="alert">Choose a start date on or before the end date.</p>}
      {error && <p role="alert">Unable to load the dashboard: {error.message}</p>}
      {exportCsv.error && <p role="alert">Unable to export: {exportCsv.error.message}</p>}
      {valid && !error && !totals.data && <p>Loading the figures…</p>}

      {totals.data && (
        <dl className="dashboard-tiles">
          <div>
            <dt>Revenue</dt>
            <dd>{money(totals.data.revenue)}</dd>
          </div>
          <div>
            <dt>Sales</dt>
            <dd>{formatCount(totals.data.sales)}</dd>
          </div>
          <div>
            <dt>Average sale</dt>
            <dd>{money(totals.data.average)}</dd>
          </div>
        </dl>
      )}

      {series.data && (
        <section aria-labelledby="dashboard-series" className="dashboard-block">
          <div className="dashboard-heading">
            <h2 id="dashboard-series">{seriesTitle}</h2>
            {download("series", seriesTitle.toLowerCase())}
          </div>
          <Chart
            series={series.data}
            label={`${seriesTitle} from ${formatPeriod(from)} to ${formatPeriod(to)}. The table below lists each ${unit}.`}
          />
          <div className="dashboard-scroll">
            <table className="dashboard-table">
              <caption className="dashboard-hidden">{seriesTitle}</caption>
              <thead>
                <tr>
                  <th scope="col">{unit === "month" ? "Month" : "Day"}</th>
                  <th scope="col" className="dashboard-number">
                    Sales
                  </th>
                  <th scope="col" className="dashboard-number">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {series.data.points.map((point) => (
                  <tr key={point.period}>
                    <th scope="row">{formatPeriod(point.period)}</th>
                    <td className="dashboard-number">{formatCount(point.sales)}</td>
                    <td className="dashboard-number">{money(point.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {breakdown.data && (
        <section aria-labelledby="dashboard-breakdown" className="dashboard-block">
          <div className="dashboard-heading">
            <h2 id="dashboard-breakdown">Revenue by category</h2>
            {download("breakdown", "revenue by category")}
          </div>
          {breakdown.data.length === 0 ? (
            <p>No sales in this range.</p>
          ) : (
            <div className="dashboard-scroll">
              <table className="dashboard-table">
                <caption className="dashboard-hidden">Revenue by category</caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" className="dashboard-number">
                      Sales
                    </th>
                    <th scope="col" className="dashboard-number">
                      Revenue
                    </th>
                    <th scope="col" className="dashboard-number">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.data.map((row) => (
                    <tr key={row.category}>
                      <th scope="row">{row.category}</th>
                      <td className="dashboard-number">{formatCount(row.sales)}</td>
                      <td className="dashboard-number">{money(row.revenue)}</td>
                      <td className="dashboard-number">
                        {share.format(revenueTotal === 0 ? 0 : row.revenue / revenueTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
