import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Slots } from "../App.tsx";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, nextSteps, statusLabel, type OrderStatus } from "./format.ts";

export function OrderDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const order = useQuery(trpc.orders.get.queryOptions({ id }));
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const move = useMutation(
    trpc.orders.setStatus.mutationOptions({
      onSuccess: () => setConfirmingCancel(false),
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.orders.pathKey() }),
    })
  );
  // The status when the page opened, so a change made here or by a slot's view is announced.
  const [openedAs, setOpenedAs] = useState<OrderStatus>();
  if (openedAs === undefined && order.data) setOpenedAs(order.data.status);

  if (order.error?.data?.code === "NOT_FOUND") {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Order not found
        </h1>
        <p>
          It may have the wrong number in the address. <a href="#/orders">See every order</a>.
        </p>
      </main>
    );
  }
  if (order.error) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Unable to load the order
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
  if (!order.data) return <main aria-busy="true" />;
  const { reference, status, createdAt, currency, lines, subtotal, tax, total } = order.data;
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Order {reference}
      </h1>
      <p>
        Placed {formatDate(createdAt)}. Status: <strong>{statusLabel(status)}</strong>
      </p>
      {nextSteps[status].length > 0 && !confirmingCancel && (
        <div className="order-actions">
          {nextSteps[status].map((step) => {
            const button = (
              <button
                key={step.to}
                type="button"
                disabled={move.isPending}
                onClick={() =>
                  step.to === "cancelled"
                    ? setConfirmingCancel(true)
                    : move.mutate({ id, to: step.to })
                }
              >
                {step.label}
              </button>
            );
            // A link shape that fulfills the order (taking it out of stock, say) replaces the button.
            return step.to === "fulfilled" ? (
              <Slots key={step.to} name="order-fulfillment" id={id} fallback={button} />
            ) : (
              button
            );
          })}
        </div>
      )}
      {confirmingCancel && (
        <div className="order-confirm">
          <p ref={focusOnMount} tabIndex={-1}>
            Cancel {reference}? The order stops here, and this cannot be undone.
          </p>
          <div className="order-actions">
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => move.mutate({ id, to: "cancelled" })}
            >
              Cancel {reference}
            </button>
            <button type="button" onClick={() => setConfirmingCancel(false)}>
              Keep order
            </button>
          </div>
        </div>
      )}
      <p role="status" className="order-status-message">
        {openedAs !== undefined && status !== openedAs
          ? `Order ${reference} is now ${statusLabel(status).toLowerCase()}.`
          : ""}
      </p>
      {move.error && <p role="alert">Unable to change the status: {move.error.message}</p>}

      <h2>Customer</h2>
      <dl className="order-customer">
        <dt>Name</dt>
        <dd>{order.data.name}</dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${order.data.email}`}>{order.data.email}</a>
        </dd>
        {order.data.phone && (
          <>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${order.data.phone}`}>{order.data.phone}</a>
            </dd>
          </>
        )}
        <dt>Delivery address</dt>
        <dd className="order-multiline">{order.data.address}</dd>
        {order.data.notes && (
          <>
            <dt>Notes</dt>
            <dd className="order-multiline">{order.data.notes}</dd>
          </>
        )}
      </dl>

      <h2>Items</h2>
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
            {lines.map((line) => (
              <tr key={line.id}>
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
