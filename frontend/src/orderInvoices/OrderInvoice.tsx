import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";

// The select's value for "make a new customer from the order".
const newCustomer = "new";

// Shown on an order, in the orders shape's "order" slot: once the order is fulfilled, "Make
// invoice" for a customer staff pick or create, then a link to the invoice made from it.
export function OrderInvoice({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its status changes.
  const order = useQuery(trpc.orders.get.queryOptions({ id }));
  const link = useQuery(trpc.orderInvoices.get.queryOptions({ id }));
  const customers = useQuery(trpc.customers.list.queryOptions());
  const make = useMutation(
    trpc.orderInvoices.invoice.mutationOptions({
      onSuccess: async (invoice) => {
        await queryClient.invalidateQueries({ queryKey: trpc.orderInvoices.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.customers.pathKey() });
        window.location.assign(`#/invoices/${invoice.id}`);
      },
      // Someone else may have made the invoice first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.orderInvoices.pathKey() }),
    })
  );

  if (link.data?.invoice) {
    return (
      <p>
        Invoiced as <a href={`#/invoices/${link.data.invoice.id}`}>{link.data.invoice.reference}</a>
      </p>
    );
  }
  if (!link.data || !customers.data || order.data?.status !== "fulfilled") return null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const picked = String(new FormData(event.currentTarget).get("customerId"));
    make.mutate({
      orderId: id,
      customerId: picked === newCustomer ? undefined : Number(picked),
    });
  };

  return (
    <form onSubmit={onSubmit} className="order-form" aria-labelledby="order-invoice-heading">
      <h2 id="order-invoice-heading">Invoice</h2>
      <p className="order-hint">
        {link.data.customerId === null
          ? "No customer has this order's email. Choose one, or make a new customer from the order."
          : "The customer with this order's email is chosen. Check it before making the invoice."}
      </p>
      <div className="order-fields">
        <label>
          Customer{" "}
          <select
            name="customerId"
            required
            defaultValue={link.data.customerId ?? ""}
            key={link.data.customerId ?? "none"}
          >
            <option value="" disabled>
              Choose a customer
            </option>
            <option value={newCustomer}>New customer: {order.data.name}</option>
            {customers.data.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.email ? `${customer.name} (${customer.email})` : customer.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={make.isPending}>
          Make invoice
        </button>
      </div>
      {make.error && <p role="alert">Unable to make the invoice: {make.error.message}</p>}
    </form>
  );
}

// Shown on an invoice, in the invoices shape's "invoice" slot: the order it was made from.
export function InvoiceOrder({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const order = useQuery(trpc.orderInvoices.order.queryOptions({ id }));

  if (!order.data) return null;
  return (
    <p className="invoice-no-print">
      Made from order <a href={`#/orders/${order.data.id}`}>{order.data.reference}</a>
    </p>
  );
}
