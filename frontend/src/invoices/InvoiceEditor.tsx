import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { currencyDigits, formatScaled, parseScaled } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { kinds, localDay, type Kind, type Outputs } from "./format.ts";
import { TotalsList } from "./InvoiceView.tsx";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

// Lines are edited as the text people type and parsed to integers only for totals and saving.
type LineDraft = {
  readonly key: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
};

const emptyLine = (): LineDraft => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "",
});

// An empty tax rate is 0%. Undefined when the quantity, price or rate is not a valid number.
const parseLine = (line: LineDraft, digits: number) => {
  const quantity = parseScaled(line.quantity, 3);
  const unitPrice = parseScaled(line.unitPrice, digits);
  const taxRate = line.taxRate.trim() === "" ? 0 : parseScaled(line.taxRate, 2);
  if (quantity === undefined || quantity <= 0 || unitPrice === undefined) return undefined;
  if (taxRate === undefined || taxRate > 10_000) return undefined;
  return { description: line.description.trim(), quantity, unitPrice, taxRate };
};

const move = <T,>(items: readonly T[], from: number, to: number): readonly T[] => {
  const moved = items.filter((_, index) => index !== from);
  return [...moved.slice(0, to), items[from], ...moved.slice(to)];
};

function EditorForm({ kind, invoice }: { readonly kind: Kind; readonly invoice?: Outputs["get"] }) {
  const trpc = useTRPC();
  const api = trpc[kind.path];
  const queryClient = useQueryClient();
  const customers = useQuery(trpc.customers.list.queryOptions());
  const [customerId, setCustomerId] = useState(invoice ? String(invoice.customerId) : "");
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? localDay());
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? localDay(30));
  const [currency, setCurrency] = useState(invoice?.currency ?? "USD");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<readonly LineDraft[]>(() => {
    if (!invoice) return [emptyLine()];
    const digits = currencyDigits(invoice.currency);
    return invoice.lines.map((line) => ({
      key: crypto.randomUUID(),
      description: line.description,
      quantity: formatScaled(line.quantity, 3),
      unitPrice: formatScaled(line.unitPrice, digits),
      taxRate: line.taxRate === 0 ? "" : formatScaled(line.taxRate, 2),
    }));
  });
  const [error, setError] = useState("");

  const validCurrency = /^[A-Z]{3}$/.test(currency);
  const digits = validCurrency ? currencyDigits(currency) : 2;
  const amounts = lines.flatMap((line) => {
    const parsed = parseLine(line, digits);
    return parsed ? [parsed] : [];
  });
  const totals = useQuery({
    ...api.totals.queryOptions({ lines: amounts }),
    placeholderData: keepPreviousData,
  });

  const onSaved = async (saved: { readonly id: number }) => {
    await queryClient.invalidateQueries({ queryKey: api.pathKey() });
    window.location.assign(`#/${kind.path}/${saved.id}`);
  };
  const create = useMutation(api.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(api.update.mutationOptions({ onSuccess: onSaved }));
  const save = invoice ? update : create;

  const setLine = (index: number, change: Partial<LineDraft>) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, ...change } : line)));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = lines.map((line) => parseLine(line, digits));
    const invalid = parsed.findIndex((line) => line === undefined || line.description === "");
    if (invalid >= 0) {
      setError(
        `Check line ${invalid + 1}: give it a description, a quantity like 2.5 and a price like 40.00.`
      );
      return;
    }
    setError("");
    const input = {
      customerId: Number(customerId),
      issueDate,
      dueDate,
      currency,
      notes,
      lines: parsed.flatMap((line) => (line ? [line] : [])),
    };
    if (invoice) update.mutate({ ...input, id: invoice.id });
    else create.mutate(input);
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="editor-title">
      <h1 id="editor-title" ref={focusOnMount} tabIndex={-1}>
        {invoice ? `Edit ${invoice.reference}` : `New ${kind.name}`}
      </h1>
      {customers.data?.length === 0 && (
        <p>
          {kind.plural} need a customer. <a href="#/customers">Add a customer</a>
        </p>
      )}
      <div className="invoice-actions">
        <label>
          Customer{" "}
          <select
            required
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Choose a customer</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Issue date{" "}
          <input
            type="date"
            required
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </label>
        <label>
          {kind.dueDateLabel}{" "}
          <input
            type="date"
            required
            min={issueDate}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label>
          Currency{" "}
          <input
            required
            size={4}
            maxLength={3}
            pattern="[A-Z]{3}"
            placeholder="USD"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </label>
      </div>
      <h2>Lines</h2>
      <div className="invoice-scroll">
        <table className="invoice-table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col">Quantity</th>
              <th scope="col">Unit price</th>
              <th scope="col">Tax %</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const n = index + 1;
              return (
                <tr key={line.key}>
                  <td>
                    <input
                      aria-label={`Description, line ${n}`}
                      required
                      maxLength={500}
                      value={line.description}
                      onChange={(event) => setLine(index, { description: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantity, line ${n}`}
                      inputMode="decimal"
                      required
                      value={line.quantity}
                      onChange={(event) => setLine(index, { quantity: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Unit price, line ${n}`}
                      inputMode="decimal"
                      required
                      placeholder="40.00"
                      value={line.unitPrice}
                      onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Tax %, line ${n}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.taxRate}
                      onChange={(event) => setLine(index, { taxRate: event.target.value })}
                    />
                  </td>
                  <td className="invoice-actions">
                    <button
                      type="button"
                      aria-label={`Move line ${n} up`}
                      disabled={index === 0}
                      onClick={() => setLines(move(lines, index, index - 1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      aria-label={`Move line ${n} down`}
                      disabled={index === lines.length - 1}
                      onClick={() => setLines(move(lines, index, index + 1))}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove line ${n}`}
                      onClick={() => setLines(lines.filter((_, at) => at !== index))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        <button type="button" onClick={() => setLines([...lines, emptyLine()])}>
          Add line
        </button>
      </p>
      {totals.data && (
        <TotalsList totals={totals.data} currency={validCurrency ? currency : "USD"} />
      )}
      <p>
        <label>
          Notes{" "}
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </p>
      {error && <p role="alert">{error}</p>}
      {save.error && (
        <p role="alert">
          Unable to save the {kind.name}: {save.error.message}
        </p>
      )}
      <div className="invoice-actions">
        <button type="submit" disabled={save.isPending}>
          Save {kind.name}
        </button>
        <a href={invoice ? `#/${kind.path}/${invoice.id}` : `#/${kind.path}`}>Cancel</a>
      </div>
    </form>
  );
}

export function InvoiceEditor({
  id,
  kind = kinds.invoice,
}: {
  readonly id?: number;
  readonly kind?: Kind;
}) {
  const api = useTRPC()[kind.path];
  const invoice = useQuery({ ...api.get.queryOptions({ id: id ?? 0 }), enabled: !!id });

  if (id === undefined) {
    return (
      <main>
        <EditorForm kind={kind} />
      </main>
    );
  }
  return (
    <main>
      {invoice.error && (
        <p role="alert">
          Unable to load this {kind.name}: {invoice.error.message}
        </p>
      )}
      {invoice.data && invoice.data.status !== "draft" && (
        <p>
          Only draft {kind.path} can be edited.{" "}
          <a href={`#/${kind.path}/${id}`}>View {invoice.data.reference}</a>
        </p>
      )}
      {invoice.data?.status === "draft" && <EditorForm kind={kind} invoice={invoice.data} />}
    </main>
  );
}
