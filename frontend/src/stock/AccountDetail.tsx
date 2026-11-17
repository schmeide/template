import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import {
  focusOnMount,
  formatDate,
  formatQuantity,
  kindLabel,
  kinds,
  localDay,
  type Item,
  type Kind,
  type StockEntry,
} from "./format.ts";

// One item: its balance, a quick entry form, its history with reversal, and its settings.
export function AccountDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const item = useQuery(trpc.stock.get.queryOptions({ id }));
  const [reversing, setReversing] = useState<StockEntry>();
  const history = useRef<HTMLHeadingElement>(null);

  return (
    <main>
      <p>
        <a href="#/stock">Back to all items</a>
      </p>
      {item.error && <p role="alert">Unable to load this item: {item.error.message}</p>}
      {item.data && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {item.data.name}
          </h1>
          <p className="stock-balance">
            {formatQuantity(item.data.balance, item.data.unit)} in stock
          </p>
          <EntryForm item={item.data} />
          <section aria-labelledby="stock-history">
            <h2 id="stock-history" ref={history} tabIndex={-1}>
              History
            </h2>
            {item.data.entries.length === 0 ? (
              <p>No entries yet. Record the first one above.</p>
            ) : (
              <div className="stock-scroll">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Kind</th>
                      <th scope="col" className="stock-number">
                        Quantity
                      </th>
                      <th scope="col">Who</th>
                      <th scope="col">Reference</th>
                      <th scope="col">Note</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.data.entries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        unit={item.data.unit}
                        onReverse={() => setReversing(entry)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {reversing && (
              <ReverseForm
                key={reversing.id}
                entry={reversing}
                unit={item.data.unit}
                onDone={() => {
                  setReversing(undefined);
                  // The Reverse button is gone or about to be, so focus lands on the history.
                  history.current?.focus();
                }}
              />
            )}
          </section>
          <SettingsForm key={item.data.id} item={item.data} />
        </>
      )}
    </main>
  );
}

const describeEntry = (entry: StockEntry, unit: string) =>
  `${formatQuantity(entry.quantity, unit, true)} on ${formatDate(entry.entryDate)}`;

function EntryRow({
  entry,
  unit,
  onReverse,
}: {
  readonly entry: StockEntry;
  readonly unit: string;
  readonly onReverse: () => void;
}) {
  return (
    <tr>
      <td>{formatDate(entry.entryDate)}</td>
      <td>{kindLabel(entry.kind)}</td>
      <td className="stock-number">{formatQuantity(entry.quantity, unit, true)}</td>
      <td>{entry.who}</td>
      <td>{entry.reference}</td>
      <td className="stock-note">{entry.note}</td>
      <td>
        {entry.reverses !== null ? (
          "Reversal"
        ) : entry.reversedBy !== null ? (
          "Reversed"
        ) : (
          <button
            type="button"
            onClick={onReverse}
            aria-label={`Reverse ${describeEntry(entry, unit)}`}
          >
            Reverse
          </button>
        )}
      </td>
    </tr>
  );
}

const useRefresh = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
};

// In and out take a quantity and apply its sign; an adjustment takes a signed quantity.
function EntryForm({ item }: { readonly item: Item }) {
  const trpc = useTRPC();
  const add = useMutation(trpc.stock.addEntry.mutationOptions({ onSettled: useRefresh() }));
  const [kind, setKind] = useState<Kind>("in");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name));
    const quantity = Number(text("quantity"));
    add.mutate(
      {
        accountId: item.id,
        kind,
        quantity: kind === "out" ? -quantity : quantity,
        entryDate: text("entryDate"),
        who: text("who"),
        reference: text("reference"),
        note: text("note"),
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="stock-record" className="stock-form">
      <h2 id="stock-record">Record stock</h2>
      <div className="stock-fields">
        <label>
          Kind{" "}
          <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
            {kinds.map((option) => (
              <option key={option.kind} value={option.kind}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity{" "}
          <input
            name="quantity"
            type="number"
            required
            step={1}
            min={kind === "adjust" ? undefined : 1}
            inputMode="numeric"
            aria-describedby={kind === "adjust" ? "stock-adjust-hint" : undefined}
          />
        </label>
        <label>
          Date <input name="entryDate" type="date" required defaultValue={localDay()} />
        </label>
        <label>
          Who <input name="who" maxLength={100} autoComplete="name" />
        </label>
        <label>
          Reference{" "}
          <input name="reference" maxLength={100} autoComplete="off" placeholder="PO-1042" />
        </label>
        <label>
          Note <input name="note" maxLength={500} autoComplete="off" />
        </label>
      </div>
      {kind === "adjust" && (
        <p id="stock-adjust-hint" className="stock-hint">
          Enter the difference from a count. Use a minus sign to take stock away.
        </p>
      )}
      <p>
        <button type="submit" disabled={add.isPending}>
          Add entry
        </button>
      </p>
      {add.error && <p role="alert">Unable to add the entry: {add.error.message}</p>}
      <p role="status">{add.isSuccess ? "Entry added" : ""}</p>
    </form>
  );
}

// A reversal is a new entry with the opposite quantity, dated today. It cannot be reversed itself.
function ReverseForm({
  entry,
  unit,
  onDone,
}: {
  readonly entry: StockEntry;
  readonly unit: string;
  readonly onDone: () => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefresh();
  const reverse = useMutation(trpc.stock.reverse.mutationOptions());

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    reverse.mutate(
      {
        entryId: entry.id,
        entryDate: localDay(),
        who: String(data.get("who")),
        note: String(data.get("note")),
      },
      {
        onSuccess: async () => {
          await refresh();
          onDone();
        },
      }
    );
  };

  const title = `Reverse ${describeEntry(entry, unit)}`;
  return (
    <form onSubmit={onSubmit} aria-label={title} className="stock-form stock-reverse">
      <h3>{title}?</h3>
      <p>This adds an entry that cancels it out. A reversal cannot be reversed.</p>
      <label>
        Reason <input ref={focusOnMount} name="note" maxLength={500} autoComplete="off" />
      </label>
      <label>
        Who <input name="who" maxLength={100} autoComplete="name" />
      </label>
      <p className="stock-buttons">
        <button type="submit" disabled={reverse.isPending}>
          Reverse entry
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </p>
      {reverse.error && <p role="alert">Unable to reverse: {reverse.error.message}</p>}
    </form>
  );
}

function SettingsForm({ item }: { readonly item: Item }) {
  const trpc = useTRPC();
  const update = useMutation(trpc.stock.updateAccount.mutationOptions({ onSuccess: useRefresh() }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lowAt = String(data.get("lowAt"));
    update.mutate({
      id: item.id,
      name: String(data.get("name")),
      unit: String(data.get("unit")),
      lowAt: lowAt === "" ? null : Number(lowAt),
      floor: data.get("negative") ? null : (item.floor ?? 0),
    });
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="stock-settings" className="stock-form">
      <h2 id="stock-settings">Item settings</h2>
      <div className="stock-fields">
        <label>
          Name{" "}
          <input name="name" required maxLength={200} autoComplete="off" defaultValue={item.name} />
        </label>
        <label>
          Unit <input name="unit" maxLength={20} autoComplete="off" defaultValue={item.unit} />
        </label>
        <label>
          Low at{" "}
          <input
            name="lowAt"
            type="number"
            step={1}
            inputMode="numeric"
            defaultValue={item.lowAt ?? ""}
          />
        </label>
      </div>
      <label>
        <input name="negative" type="checkbox" defaultChecked={item.floor === null} /> Allow stock
        below zero
      </label>
      <p>
        <button type="submit" disabled={update.isPending}>
          Save item
        </button>
      </p>
      {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
      <p role="status">{update.isSuccess ? "Saved" : ""}</p>
    </form>
  );
}
