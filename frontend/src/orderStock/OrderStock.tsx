import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";

// Shown on a product, in the orders shape's "product" slot: the stock items one unit of the
// product takes, which staff add, change and remove.
export function ProductStock({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const items = useQuery(trpc.orderStock.items.queryOptions({ id }));
  const stock = useQuery(trpc.stock.balances.queryOptions());
  const [invalid, setInvalid] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.orderStock.pathKey() });
  const save = useMutation(trpc.orderStock.setItem.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.orderStock.removeItem.mutationOptions({ onSuccess: refresh }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = Number(data.get("quantity"));
    const valid = Number.isInteger(quantity) && quantity > 0;
    setInvalid(!valid);
    if (!valid) return;
    save.mutate(
      { productId: id, accountId: Number(data.get("accountId")), quantity },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <section aria-labelledby="order-stock-heading">
      <h2 id="order-stock-heading">Stock used</h2>
      <p className="order-hint">One sold takes these from stock when its order is fulfilled.</p>
      {items.error && <p role="alert">Unable to load the stock used: {items.error.message}</p>}
      {items.data?.length === 0 && <p>Takes nothing from stock. Add the items it uses below.</p>}
      {items.data && items.data.length > 0 && (
        <div className="order-scroll">
          <table className="order-table">
            <thead>
              <tr>
                <th scope="col">Stock item</th>
                <th scope="col" className="order-number">
                  Per one sold
                </th>
                <th scope="col">
                  <span className="order-visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.data.map((item) => (
                <tr key={item.accountId}>
                  <td>{item.name}</td>
                  <td className="order-number">
                    {item.quantity}
                    {item.unit && ` ${item.unit}`}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ productId: id, accountId: item.accountId })}
                    >
                      Remove <span className="order-visually-hidden">{item.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {remove.error && <p role="alert">Unable to remove the item: {remove.error.message}</p>}
      {stock.data?.length === 0 ? (
        <p>
          No stock items yet. Add them on the <a href="#/stock">Stock page</a>.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="order-form" aria-labelledby="order-stock-add">
          <h3 id="order-stock-add">Add or change a stock item</h3>
          <div className="order-fields">
            <label>
              Stock item{" "}
              <select name="accountId" required defaultValue="">
                <option value="" disabled>
                  Choose an item
                </option>
                {stock.data?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.unit ? `${option.name} (${option.unit})` : option.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Per one sold{" "}
              <input
                name="quantity"
                required
                inputMode="numeric"
                autoComplete="off"
                size={6}
                aria-invalid={invalid}
                aria-describedby={invalid ? "order-stock-quantity-error" : undefined}
              />
            </label>
            <button type="submit" disabled={save.isPending}>
              Save stock item
            </button>
          </div>
          {invalid && (
            <p id="order-stock-quantity-error" role="alert">
              Enter a whole number above zero, in the item&apos;s unit, such as 1 or 250.
            </p>
          )}
          {save.error && <p role="alert">Unable to save the item: {save.error.message}</p>}
        </form>
      )}
    </section>
  );
}

// Shown on a ready order in place of the orders shape's "Mark fulfilled", in its
// "order-fulfillment" slot: fulfilling takes the order's stock items out of stock.
export function OrderFulfillment({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fulfill = useMutation(
    trpc.orderStock.fulfill.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.orders.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
      },
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    fulfill.mutate({ orderId: id, who: String(new FormData(event.currentTarget).get("who")) });
  };

  return (
    <form onSubmit={onSubmit} className="order-actions" aria-label="Fulfill the order">
      <label>
        Fulfilled by <input name="who" maxLength={100} autoComplete="name" size={16} />
      </label>
      <button type="submit" disabled={fulfill.isPending}>
        Mark fulfilled
      </button>
      {fulfill.error && (
        <p role="alert" className="order-warning">
          Unable to fulfill the order: {fulfill.error.message}
        </p>
      )}
    </form>
  );
}
