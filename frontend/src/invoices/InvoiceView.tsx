import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { currencyDigits, formatMoney, formatScaled, parseScaled } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { business } from "./business.ts";
import {
  formatDate,
  formatQuantity,
  formatTaxRate,
  localDay,
  methodLabels,
  statusLabels,
  type Outputs,
  type PaymentMethod,
} from "./format.ts";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

type Totals = { readonly subtotal: number; readonly tax: number; readonly total: number };

export function TotalsList({
  totals,
  currency,
  paid = 0,
}: {
  readonly totals: Totals;
  readonly currency: string;
  readonly paid?: number;
}) {
  const money = (amount: number) => formatMoney(amount, currency);
  return (
    <section aria-label="Totals" className="invoice-totals">
      <dl>
        <dt>Subtotal</dt>
        <dd>{money(totals.subtotal)}</dd>
        <dt>Tax</dt>
        <dd>{money(totals.tax)}</dd>
        <dt className="invoice-grand-total">Total</dt>
        <dd className="invoice-grand-total">{money(totals.total)}</dd>
        {paid > 0 && (
          <>
            <dt>Paid</dt>
            <dd>{money(paid)}</dd>
            <dt className="invoice-grand-total">Balance due</dt>
            <dd className="invoice-grand-total">{money(totals.total - paid)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

// The document itself, as the customer sees it on screen, on paper and through the share link.
function DocumentBody({ document }: { readonly document: Outputs["shared"] }) {
  const money = (amount: number) => formatMoney(amount, document.currency);
  return (
    <article>
      <header className="invoice-header">
        <div>
          <p>
            <strong>{business.name}</strong>
          </p>
          <p className="invoice-multiline">{business.address}</p>
          <p>{business.email}</p>
        </div>
        <div>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {document.reference}
          </h1>
          <p>Status: {statusLabels[document.status]}</p>
          <p>Issued {formatDate(document.issueDate)}</p>
          <p>Due {formatDate(document.dueDate)}</p>
        </div>
      </header>
      <section aria-labelledby="bill-to">
        <h2 id="bill-to">Bill to</h2>
        <p>{document.customer.name}</p>
        {document.customer.address && (
          <p className="invoice-multiline">{document.customer.address}</p>
        )}
        {document.customer.email && <p>{document.customer.email}</p>}
      </section>
      <div className="invoice-scroll">
        <table className="invoice-table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="amount">
                Quantity
              </th>
              <th scope="col" className="amount">
                Unit price
              </th>
              <th scope="col" className="amount">
                Tax
              </th>
              <th scope="col" className="amount">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.description}</td>
                <td className="amount">{formatQuantity(line.quantity)}</td>
                <td className="amount">{money(line.unitPrice)}</td>
                <td className="amount">{formatTaxRate(line.taxRate)}</td>
                <td className="amount">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TotalsList totals={document} currency={document.currency} paid={document.paid} />
      {document.notes && <p className="invoice-multiline">{document.notes}</p>}
      {document.payments.length > 0 && (
        <section aria-labelledby="payments">
          <h2 id="payments">Payments</h2>
          <table className="invoice-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Method</th>
                <th scope="col" className="amount">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {document.payments.map((payment, index) => (
                <tr key={index}>
                  <td>{formatDate(payment.paidOn)}</td>
                  <td>{methodLabels[payment.method]}</td>
                  <td className="amount">{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

function PaymentForm({ invoice }: { readonly invoice: Outputs["get"] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const record = useMutation(
    trpc.invoices.recordPayment.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() }),
    })
  );
  const [error, setError] = useState("");
  const digits = currencyDigits(invoice.currency);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = parseScaled(String(data.get("amount")), digits);
    if (amount === undefined || amount <= 0) {
      setError(`Enter the amount as a number, like ${formatScaled(invoice.balance, digits)}.`);
      return;
    }
    setError("");
    record.mutate({
      documentId: invoice.id,
      amount,
      paidOn: String(data.get("paidOn")),
      method: String(data.get("method")) as PaymentMethod,
    });
  };

  return (
    <form
      key={invoice.balance}
      onSubmit={onSubmit}
      aria-labelledby="record-payment"
      className="invoice-no-print"
    >
      <h2 id="record-payment">Record a payment</h2>
      <div className="invoice-actions">
        <label>
          Amount{" "}
          <input
            name="amount"
            inputMode="decimal"
            required
            defaultValue={formatScaled(invoice.balance, digits)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "payment-error" : undefined}
          />
        </label>
        <label>
          Date <input name="paidOn" type="date" required defaultValue={localDay()} />
        </label>
        <label>
          Method{" "}
          <select name="method" defaultValue="bank transfer">
            {Object.entries(methodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={record.isPending}>
          Record payment
        </button>
      </div>
      {error && <p id="payment-error">{error}</p>}
      {record.error && <p role="alert">Unable to record the payment: {record.error.message}</p>}
    </form>
  );
}

function ShareLink({ token }: { readonly token: string }) {
  const [message, setMessage] = useState("");
  // The Clipboard API exists only on https and localhost.
  const copy = () =>
    navigator.clipboard
      ? navigator.clipboard.writeText(url).then(
          () => setMessage("Link copied"),
          () => setMessage("Unable to copy. Select the link and copy it.")
        )
      : setMessage("Unable to copy here. Select the link and copy it.");
  const url = `${window.location.origin}${window.location.pathname}#/invoices/share/${token}`;
  return (
    <div className="invoice-actions invoice-no-print">
      <label>
        Share link <input readOnly value={url} size={40} />
      </label>
      <button type="button" onClick={copy}>
        Copy link
      </button>
      <span role="status">{message}</span>
    </div>
  );
}

export function InvoiceView({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invoice = useQuery(trpc.invoices.get.queryOptions({ id }));
  const setStatus = useMutation(
    trpc.invoices.setStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() }),
    })
  );
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  if (invoice.error) {
    return (
      <main>
        <p role="alert">Unable to load this invoice: {invoice.error.message}</p>
        <a href="#/invoices">Back to invoices</a>
      </main>
    );
  }
  if (!invoice.data) {
    return (
      <main aria-busy="true">
        <p>Loading invoice…</p>
      </main>
    );
  }
  const { status, reference } = invoice.data;
  const open = status === "sent" || status === "overdue";

  return (
    <main>
      <div className="invoice-actions invoice-no-print">
        <a href="#/invoices">Back to invoices</a>
        {status === "draft" && <a href={`#/invoices/${id}/edit`}>Edit invoice</a>}
        {status === "draft" && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id, status: "sent" })}
          >
            Mark as sent
          </button>
        )}
        {(status === "draft" || open) && !confirmingVoid && (
          <button type="button" onClick={() => setConfirmingVoid(true)}>
            Void invoice
          </button>
        )}
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {confirmingVoid && (
        <div className="invoice-actions invoice-no-print">
          <p>Void {reference}? It can no longer be edited, sent or paid. This cannot be undone.</p>
          <button
            type="button"
            onClick={() =>
              setStatus.mutate(
                { id, status: "void" },
                { onSuccess: () => setConfirmingVoid(false) }
              )
            }
          >
            Void {reference}
          </button>
          <button type="button" onClick={() => setConfirmingVoid(false)}>
            Keep invoice
          </button>
        </div>
      )}
      {setStatus.error && (
        <p role="alert">Unable to update the invoice: {setStatus.error.message}</p>
      )}
      {status !== "draft" && <ShareLink token={invoice.data.shareToken} />}
      <DocumentBody document={invoice.data} />
      {open && <PaymentForm invoice={invoice.data} />}
    </main>
  );
}

// The public view behind a share link: the document and a print button, nothing else.
export function SharedInvoice({ token }: { readonly token: string }) {
  const trpc = useTRPC();
  const invoice = useQuery(trpc.invoices.shared.queryOptions({ token }));

  return (
    <main>
      {invoice.error && (
        <p role="alert">This invoice link is not valid. Ask the sender for a new link.</p>
      )}
      {invoice.data && (
        <>
          <div className="invoice-actions invoice-no-print">
            <button type="button" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <DocumentBody document={invoice.data} />
        </>
      )}
    </main>
  );
}
