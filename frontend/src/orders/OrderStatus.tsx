import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, statusLabel } from "./format.ts";

// The customer's view of their order, at the private link they get after checkout.
export function OrderStatus({ token }: { readonly token: string }) {
  const trpc = useTRPC();
  const order = useQuery(trpc.orders.publicOrder.queryOptions({ token }));

  if (order.error && order.error.data?.code !== "NOT_FOUND") {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Unable to load your order
        </h1>
        <p role="alert">{order.error.message}</p>
        <p>
          <button type="button" onClick={() => void order.refetch()}>
            Try again
          </button>
        </p>
      </main>
    );
  }
  if (order.error) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Order not found
        </h1>
        <p>Check that the link is complete, or contact us with the email you ordered with.</p>
      </main>
    );
  }
  if (!order.data) return <main aria-busy="true" />;
  const { reference, status, createdAt, currency, subtotal, tax, total, lines } = order.data;
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Order {reference}
      </h1>
      <p>
        Placed {formatDate(createdAt)}. Status: <strong>{statusLabel(status)}</strong>.
      </p>
      {status === "new" && <p>Thanks, we have your order. We will confirm it and how to pay.</p>}
      <p className="order-hint">
        Bookmark this page: it is the only way to check on your order. Nothing has been charged.
      </p>
      <div className="order-scroll">
        <table className="order-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="order-number">
                Quantity
              </th>
              <th scope="col" className="order-number">
                Price
              </th>
              <th scope="col" className="order-number">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>{line.name}</td>
                <td className="order-number">{line.quantity}</td>
                <td className="order-number">{money(line.unitPrice)}</td>
                <td className="order-number">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="order-totals">
        <dt>Subtotal</dt>
        <dd>{money(subtotal)}</dd>
        <dt>Tax</dt>
        <dd>{money(tax)}</dd>
        <dt>Total</dt>
        <dd className="order-grand-total">{money(total)}</dd>
      </dl>
    </main>
  );
}
