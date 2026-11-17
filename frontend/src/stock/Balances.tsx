import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatQuantity } from "./format.ts";

const optionalNumber = (value: FormDataEntryValue | null) =>
  value === null || value === "" ? null : Number(value);

// Every item with its balance, a low stock filter, and a form to add an item.
export function Balances() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const balances = useQuery(trpc.stock.balances.queryOptions());
  const create = useMutation(
    trpc.stock.createAccount.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() }),
    })
  );
  const [lowOnly, setLowOnly] = useState(false);
  const rows = (balances.data ?? []).filter((row) => !lowOnly || row.low);

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        name: String(data.get("name")),
        unit: String(data.get("unit")),
        lowAt: optionalNumber(data.get("lowAt")),
        floor: data.get("negative") ? null : 0,
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Stock
      </h1>
      <p>
        <label>
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(event) => setLowOnly(event.target.checked)}
          />{" "}
          Low stock only
        </label>
      </p>
      {balances.error && <p role="alert">Unable to load stock: {balances.error.message}</p>}
      {balances.data &&
        rows.length === 0 &&
        (lowOnly && balances.data.length > 0 ? (
          <p>
            Nothing is low.{" "}
            <button type="button" onClick={() => setLowOnly(false)}>
              Show all items
            </button>
          </p>
        ) : (
          <p>No items yet. Add the first one below.</p>
        ))}
      {rows.length > 0 && (
        <div className="stock-scroll">
          <table className="stock-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="stock-number">
                  In stock
                </th>
                <th scope="col" className="stock-number">
                  Low at
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <a href={`#/stock/${row.id}`}>{row.name}</a>
                  </td>
                  <td className="stock-number">{formatQuantity(row.balance, row.unit)}</td>
                  <td className="stock-number">
                    {row.lowAt !== null && formatQuantity(row.lowAt, row.unit)}
                  </td>
                  <td>{row.low && <strong className="stock-low">Low</strong>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={onCreate} className="stock-form">
        <h2>Add an item</h2>
        <label>
          Name <input name="name" required maxLength={200} autoComplete="off" />
        </label>
        <label>
          Unit <input name="unit" maxLength={20} autoComplete="off" placeholder="pcs" />
        </label>
        <label>
          Low at <input name="lowAt" type="number" step={1} inputMode="numeric" />
        </label>
        <label>
          <input name="negative" type="checkbox" /> Allow stock below zero
        </label>
        <p>
          <button type="submit" disabled={create.isPending}>
            Add item
          </button>
        </p>
        {create.error && <p role="alert">Unable to add the item: {create.error.message}</p>}
      </form>
    </main>
  );
}
