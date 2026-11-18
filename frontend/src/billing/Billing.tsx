import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useState, type FormEvent } from "react";
import type { AppRouter } from "../../../backend/src/router.ts";
import { formatMoney, formatScaled, parseScaled } from "../money/money.ts";
import { localDay } from "../stock/format.ts";
import { useTRPC } from "../trpc.ts";

type Billing = NonNullable<inferRouterOutputs<AppRouter>["billing"]["get"]>;

// Invoices are made in the documents table's default currency.
const currency = "USD";

// Shown on a ledger account, in the stock shape's "account" slot: who the account is billed to
// and at what rate, then a preview of a period's unbilled entries and "Create invoice".
export function AccountBilling({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const billing = useQuery(trpc.billing.get.queryOptions({ id }));

  return (
    <section aria-labelledby="billing-heading">
      <h2 id="billing-heading">Billing</h2>
      {billing.error && <p role="alert">Unable to load billing: {billing.error.message}</p>}
      {billing.data !== undefined && (
        <>
          <BillingForm
            key={billing.data ? `${billing.data.customerId}:${billing.data.rate}` : "none"}
            accountId={id}
            billing={billing.data}
          />
          {billing.data ? (
            <BillPeriod accountId={id} />
          ) : (
            <p className="stock-hint">Set the customer and rate to bill this item.</p>
          )}
        </>
      )}
    </section>
  );
}

function BillingForm({
  accountId,
  billing,
}: {
  readonly accountId: number;
  readonly billing: Billing | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const customers = useQuery(trpc.customers.list.queryOptions());
  const [invalid, setInvalid] = useState(false);
  const save = useMutation(
    trpc.billing.set.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.billing.pathKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rate = parseScaled(String(data.get("rate")), 2);
    setInvalid(rate === undefined || rate < 0);
    if (rate === undefined || rate < 0) return;
    save.mutate({ accountId, customerId: Number(data.get("customerId")), rate });
  };

  return (
    <form onSubmit={onSubmit} className="stock-form" aria-label="Billing settings">
      <div className="stock-fields">
        <label>
          Customer{" "}
          <select name="customerId" required defaultValue={billing?.customerId ?? ""}>
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.data?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rate per hour{" "}
          <input
            name="rate"
            required
            inputMode="decimal"
            autoComplete="off"
            defaultValue={billing ? formatScaled(billing.rate, 2) : ""}
            aria-invalid={invalid}
            aria-describedby={invalid ? "billing-rate-error" : undefined}
          />
        </label>
        <button type="submit" disabled={save.isPending}>
          Save billing
        </button>
      </div>
      {invalid && (
        <p id="billing-rate-error" role="alert">
          Enter the rate as an amount, such as 75 or 75.50.
        </p>
      )}
      {save.error && <p role="alert">Unable to save billing: {save.error.message}</p>}
      {save.isSuccess && <p role="status">Billing saved.</p>}
    </form>
  );
}

function BillPeriod({ accountId }: { readonly accountId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => localDay(true));
  const [to, setTo] = useState(() => localDay());
  const period = { accountId, from, to };
  const valid = from !== "" && to !== "" && from <= to;
  const preview = useQuery({ ...trpc.billing.preview.queryOptions(period), enabled: valid });
  const bill = useMutation(
    trpc.billing.bill.mutationOptions({
      onSuccess: async (invoice) => {
        await queryClient.invalidateQueries({ queryKey: trpc.billing.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
        window.location.assign(`#/invoices/${invoice.id}`);
      },
      // Someone else may have billed these entries first; show what is left.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.billing.pathKey() }),
    })
  );
  const lines = preview.data?.lines ?? [];
  const total = preview.data?.total ?? 0;

  return (
    <div className="stock-form">
      <h3>Unbilled entries</h3>
      <div className="stock-fields">
        <label>
          From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {!valid && <p role="alert">Choose a period that ends on or after its first day.</p>}
      {preview.error && <p role="alert">Unable to preview: {preview.error.message}</p>}
      {preview.data &&
        (lines.length === 0 ? (
          <p>No unbilled entries in this period. Choose another period above.</p>
        ) : (
          <>
            <div className="stock-scroll">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th scope="col">Entry</th>
                    <th scope="col" className="stock-number">
                      Hours
                    </th>
                    <th scope="col" className="stock-number">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.entryId}>
                      <td className="stock-note">{line.description}</td>
                      <td className="stock-number">{formatScaled(line.quantity, 3)}</td>
                      <td className="stock-number">{formatMoney(line.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Total <strong>{formatMoney(total, currency)}</strong>
            </p>
            {total <= 0 && (
              <p className="stock-hint">
                Credits cancel the charges in this period. They wait for the next invoice.
              </p>
            )}
            <button
              type="button"
              disabled={bill.isPending || total <= 0}
              onClick={() => bill.mutate(period)}
            >
              Create invoice
            </button>
          </>
        ))}
      {bill.error && <p role="alert">Unable to create the invoice: {bill.error.message}</p>}
    </div>
  );
}
