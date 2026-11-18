import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, statuses, statusLabel, type OrderStatus } from "./format.ts";

export function OrderList() {
  const trpc = useTRPC();
  const [status, setStatus] = useState<OrderStatus | "">("new");
  const orders = useQuery(
    trpc.orders.list.queryOptions(
      { status: status || undefined },
      { placeholderData: keepPreviousData }
    )
  );

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Orders
      </h1>
      <p>
        <label>
          Status{" "}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatus | "")}
          >
            <option value="">All statuses</option>
            {statuses.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </p>
      {orders.error && <p role="alert">Unable to load orders: {orders.error.message}</p>}
      {orders.data?.length === 0 && (
        <p>
          {status ? `No ${statusLabel(status).toLowerCase()} orders.` : "No orders yet."} Orders
          placed in the <a href="#/shop">shop</a> show here.
        </p>
      )}
      {orders.data && orders.data.length > 0 && (
        <div className="order-scroll">
          <table className="order-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Customer</th>
                <th scope="col" className="order-number">
                  Total
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id}>
                  <td>
                    <a href={`#/orders/${order.id}`}>{order.reference}</a>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>{order.name}</td>
                  <td className="order-number">{formatMoney(order.total, order.currency)}</td>
                  <td>{statusLabel(order.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
