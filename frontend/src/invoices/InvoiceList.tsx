import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { formatDate, kinds, statusLabels, type DisplayStatus, type Kind } from "./format.ts";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

export function InvoiceList({ kind = kinds.invoice }: { readonly kind?: Kind }) {
  const api = useTRPC()[kind.path];
  const [status, setStatus] = useState<DisplayStatus | "">("");
  const [search, setSearch] = useState("");
  // ponytail: queries on every keystroke; debounce the search if lists grow slow.
  const invoices = useQuery({
    ...api.list.queryOptions({
      status: status || undefined,
      search: search.trim() || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const filtered = status !== "" || search.trim() !== "";

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {kind.plural}
      </h1>
      <div className="invoice-actions">
        <a href={`#/${kind.path}/new`}>New {kind.name}</a>
        <label>
          Status{" "}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as DisplayStatus | "")}
          >
            <option value="">All</option>
            {kind.statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search{" "}
          <input
            type="search"
            value={search}
            placeholder={`Acme or ${kind.example}`}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {invoices.error && (
        <p role="alert">
          Unable to load {kind.path}: {invoices.error.message}
        </p>
      )}
      {invoices.data?.length === 0 &&
        (filtered ? (
          <p>
            No {kind.path} match these filters.{" "}
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          </p>
        ) : (
          <>
            <p>
              <strong>No {kind.path} yet</strong>
            </p>
            <p>{kind.about}</p>
          </>
        ))}
      {invoices.data && invoices.data.length > 0 && (
        <div className="invoice-scroll">
          <table className="invoice-table">
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Customer</th>
                <th scope="col">Issued</th>
                <th scope="col">{kind.dueLabel}</th>
                <th scope="col">Status</th>
                <th scope="col" className="amount">
                  Total
                </th>
                {kind.type === "invoice" && (
                  <th scope="col" className="amount">
                    Balance
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {invoices.data.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <a href={`#/${kind.path}/${invoice.id}`}>{invoice.reference}</a>
                  </td>
                  <td>{invoice.customerName}</td>
                  <td>{formatDate(invoice.issueDate)}</td>
                  <td>{formatDate(invoice.dueDate)}</td>
                  <td>{statusLabels[invoice.status]}</td>
                  <td className="amount">{formatMoney(invoice.total, invoice.currency)}</td>
                  {kind.type === "invoice" && (
                    <td className="amount">{formatMoney(invoice.balance, invoice.currency)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
