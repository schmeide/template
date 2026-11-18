import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { clearCart, maxQuantity, setQuantity, useCart } from "./cart.ts";
import { focusOnMount } from "./format.ts";

// The cart and the checkout. The prices shown are today's; the server prices the order again from
// its own records when it is placed, and only ids and counts are sent.
export function Cart() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const lines = useCart();
  const heading = useRef<HTMLHeadingElement>(null);
  const [removed, setRemoved] = useState("");
  const ids = lines.map((line) => line.productId);
  const products = useQuery({
    ...trpc.orders.shop.queryOptions({ ids }),
    enabled: ids.length > 0,
  });
  const checkout = useMutation(
    trpc.orders.checkout.mutationOptions({
      onSuccess: ({ token }) => {
        clearCart();
        window.location.assign(`#/shop/order/${token}`);
      },
      // A product taken off sale shows as unavailable once the cart reloads.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.orders.shop.pathKey() }),
    })
  );
  const currency = products.data?.currency ?? "USD";
  const byId = new Map(products.data?.products.map((product) => [product.id, product]));
  const unavailable = products.data ? lines.filter((line) => !byId.has(line.productId)) : [];
  const subtotal = lines.reduce(
    (sum, line) => sum + (byId.get(line.productId)?.price ?? 0) * line.quantity,
    0
  );
  const taxed = lines.some((line) => (byId.get(line.productId)?.taxRate ?? 0) > 0);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    checkout.mutate({
      name: text("name"),
      email: text("email"),
      phone: text("phone"),
      address: text("address"),
      notes: text("notes"),
      website: text("website"),
      lines: lines.map(({ productId, quantity }) => ({ productId, quantity })),
    });
  };

  if (lines.length === 0) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Your cart
        </h1>
        <p>
          Your cart is empty. <a href="#/shop">Browse the products</a> to add something.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1
        ref={(element) => {
          heading.current = element;
          focusOnMount(element);
        }}
        tabIndex={-1}
      >
        Your cart
      </h1>
      <p role="status" className="order-status-message">
        {removed}
      </p>
      {products.error && <p role="alert">Unable to load prices: {products.error.message}</p>}
      <div className="order-scroll">
        <table className="order-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="order-number">
                Price
              </th>
              <th scope="col">Quantity</th>
              <th scope="col" className="order-number">
                Amount
              </th>
              <th scope="col">
                <span className="order-visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const product = byId.get(line.productId);
              const name =
                product?.name ?? (products.data ? "unavailable product" : "this product");
              return (
                <tr key={line.productId}>
                  <td>
                    {product ? (
                      <a href={`#/shop/product/${product.id}`}>{product.name}</a>
                    ) : (
                      products.data && <strong className="order-warning">No longer for sale</strong>
                    )}
                  </td>
                  <td className="order-number">
                    {product && formatMoney(product.price, currency)}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Quantity of ${name}`}
                      defaultValue={line.quantity}
                      onChange={(event) => {
                        const quantity = Number(event.target.value);
                        if (quantity >= 1) setQuantity(line.productId, quantity);
                      }}
                      onBlur={(event) => {
                        event.target.value = String(line.quantity);
                      }}
                      className="order-quantity"
                    />
                  </td>
                  <td className="order-number">
                    {product && formatMoney(product.price * line.quantity, currency)}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setQuantity(line.productId, 0);
                        setRemoved(`Removed ${name} from your cart.`);
                        heading.current?.focus();
                      }}
                    >
                      Remove <span className="order-visually-hidden">{name}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {products.data && (
        <p className="order-total">
          Subtotal <strong>{formatMoney(subtotal, currency)}</strong>
        </p>
      )}
      {taxed && <p className="order-hint">Tax is added when the order is placed.</p>}

      <form onSubmit={onSubmit} aria-labelledby="checkout-heading" className="order-form">
        <h2 id="checkout-heading">Your details</h2>
        <label>
          Name <input name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label>
          Email{" "}
          <input
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            placeholder="name@example.com"
          />
        </label>
        <label>
          Phone (optional) <input name="phone" type="tel" maxLength={50} autoComplete="tel" />
        </label>
        <label>
          Delivery address{" "}
          <textarea
            name="address"
            required
            maxLength={1000}
            rows={3}
            autoComplete="street-address"
          />
        </label>
        <label>
          Notes (optional) <textarea name="notes" maxLength={2000} rows={2} />
        </label>
        {/* A honeypot: people never see or reach it, so only a bot fills it in. */}
        <div className="order-trap" inert>
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p className="order-hint">
          Nothing is charged now. We will confirm the order and how to pay.
        </p>
        {unavailable.length > 0 && (
          <p role="alert">
            Something in your cart is no longer for sale. Remove it to place the order.
          </p>
        )}
        <p>
          <button
            type="submit"
            disabled={checkout.isPending || !products.data || unavailable.length > 0}
          >
            Place order
          </button>
        </p>
        {checkout.error && <p role="alert">Unable to place the order: {checkout.error.message}</p>}
      </form>
    </main>
  );
}
