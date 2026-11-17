import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatQuantity, kinds, localDay, type SummaryRow } from "./format.ts";

type ItemTotals = {
  readonly accountId: number;
  readonly name: string;
  readonly unit: string;
  readonly byKind: readonly SummaryRow[];
};

// The server returns one row per item and kind, sorted by item; this makes one row per item.
const byItem = (rows: readonly SummaryRow[]): readonly ItemTotals[] =>
  rows.reduce<readonly ItemTotals[]>((items, row) => {
    const last = items.at(-1);
    return last?.accountId === row.accountId
      ? [...items.slice(0, -1), { ...last, byKind: [...last.byKind, row] }]
      : [...items, { accountId: row.accountId, name: row.name, unit: row.unit, byKind: [row] }];
  }, []);

const download = (csv: string, name: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

// Totals by item and kind for a period, both days included, and the entries as CSV.
export function Summary() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => localDay(true));
  const [to, setTo] = useState(() => localDay());
  const valid = from !== "" && to !== "" && from <= to;
  const summary = useQuery({
    ...trpc.stock.summary.queryOptions({ from, to }),
    enabled: valid,
  });
  const exportCsv = useMutation({
    mutationFn: () => queryClient.fetchQuery(trpc.stock.exportCsv.queryOptions({ from, to })),
    onSuccess: (csv) => download(csv, `stock-${from}-to-${to}.csv`),
  });
  const items = byItem(summary.data ?? []);

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Period summary
      </h1>
      <div className="stock-fields">
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
        <button
          type="button"
          disabled={!valid || exportCsv.isPending}
          onClick={() => exportCsv.mutate()}
        >
          Download CSV
        </button>
      </div>
      {!valid && <p role="alert">Choose a start date on or before the end date.</p>}
      {exportCsv.error && <p role="alert">Unable to export: {exportCsv.error.message}</p>}
      {summary.error && <p role="alert">Unable to load the summary: {summary.error.message}</p>}
      {valid && summary.data && items.length === 0 && <p>No entries in this period.</p>}
      {items.length > 0 && (
        <div className="stock-scroll">
          <table className="stock-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Unit</th>
                {kinds.map(({ kind, label }) => (
                  <th key={kind} scope="col" className="stock-number">
                    {label}
                  </th>
                ))}
                <th scope="col" className="stock-number">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.accountId}>
                  <th scope="row">
                    <a href={`#/stock/${item.accountId}`}>{item.name}</a>
                  </th>
                  <td>{item.unit}</td>
                  {kinds.map(({ kind }) => {
                    const row = item.byKind.find((candidate) => candidate.kind === kind);
                    return (
                      <td key={kind} className="stock-number">
                        {row && formatQuantity(row.quantity, "", true)}
                      </td>
                    );
                  })}
                  <td className="stock-number">
                    {formatQuantity(
                      item.byKind.reduce((sum, row) => sum + row.quantity, 0),
                      "",
                      true
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
