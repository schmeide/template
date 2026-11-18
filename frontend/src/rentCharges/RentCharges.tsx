import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { formatDate, localDay, statusLabels } from "../invoices/format.ts";
import { useTRPC } from "../trpc.ts";
import "./rentCharges.css";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

const count = new Intl.PluralRules(undefined);

const madeMessage = (made: number) =>
  made === 0
    ? "No rent was due that had not been billed already."
    : count.select(made) === "one"
      ? "Made 1 draft invoice."
      : `Made ${new Intl.NumberFormat().format(made)} draft invoices.`;

// #/rent: bills every lease's rent up to a day, as draft invoices.
export function BillRent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const bill = useMutation(
    trpc.rentCharges.bill.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.rentCharges.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
      },
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    bill.mutate({ upTo: String(new FormData(event.currentTarget).get("upTo")) });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Bill rent
      </h1>
      <p>
        Makes a draft invoice for each rent period that starts on or before the day and has not been
        billed, for every lease that is not cancelled. A period whose invoice was voided is billed
        again. Each invoice is due on its period&rsquo;s first day; review and send it from
        Invoices.
      </p>
      <form onSubmit={onSubmit} aria-label="Bill rent" className="rent-form">
        <label>
          Bill rent up to <input name="upTo" type="date" required defaultValue={localDay()} />
        </label>
        <button type="submit" disabled={bill.isPending}>
          Bill rent
        </button>
      </form>
      {bill.error && <p role="alert">Unable to bill rent: {bill.error.message}</p>}
      <div role="status">
        {bill.data && (
          <>
            <p>{madeMessage(bill.data.length)}</p>
            {bill.data.length > 0 && (
              <ul>
                {bill.data.map((invoice) => (
                  <li key={invoice.id}>
                    <a href={`#/invoices/${invoice.id}`}>{invoice.reference}</a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Shown on a lease, in the leases shape's "lease" slot: each period billed, with its invoice.
export function LeaseCharges({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const charges = useQuery(trpc.rentCharges.forLease.queryOptions({ id }));

  return (
    <section aria-labelledby="rent-charges">
      <h2 id="rent-charges">Rent invoices</h2>
      {charges.error && <p role="alert">Unable to load rent invoices: {charges.error.message}</p>}
      {charges.data?.length === 0 && (
        <p>
          No rent billed yet. <a href="#/rent">Bill rent</a> to invoice the periods due.
        </p>
      )}
      {charges.data && charges.data.length > 0 && (
        <div className="rent-scroll">
          <table className="rent-table">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Invoice</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {charges.data.map((charge) => (
                <tr key={charge.periodStart}>
                  <td className="rent-date">
                    {formatDate(charge.periodStart)} to {formatDate(charge.periodEnd)}
                  </td>
                  <td>
                    <a href={`#/invoices/${charge.invoice.id}`}>{charge.invoice.reference}</a>
                  </td>
                  <td>{statusLabels[charge.invoice.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Shown on an invoice, in the invoices shape's "invoice" slot: the lease and period it bills.
export function InvoiceRent({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const charge = useQuery(trpc.rentCharges.forInvoice.queryOptions({ id }));

  if (!charge.data) return null;
  const { leaseId, unitName, periodStart, periodEnd } = charge.data;
  return (
    <p className="invoice-no-print">
      Rent for <a href={`#/leases/${leaseId}`}>{unitName}</a>, {formatDate(periodStart)} to{" "}
      {formatDate(periodEnd)}
    </p>
  );
}
