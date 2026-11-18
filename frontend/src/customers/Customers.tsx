import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { FormEvent } from "react";
import type { AppRouter } from "../../../backend/src/router.ts";
import { Slots, useHashPath } from "../App.tsx";
import { useTRPC } from "../trpc.ts";

type Customer = inferRouterOutputs<AppRouter>["customers"]["get"];

const focusOnMount = (element: HTMLElement | null) => element?.focus();

const readFields = (form: HTMLFormElement) => {
  const data = new FormData(form);
  return {
    name: String(data.get("name")),
    email: String(data.get("email")),
    phone: String(data.get("phone")),
    address: String(data.get("address")),
  };
};

// autoComplete is off: these are the customer's details, not the person typing them.
function CustomerFields({ customer }: { readonly customer?: Customer }) {
  return (
    <>
      <p>
        <label>
          Name{" "}
          <input
            name="name"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={customer?.name}
          />
        </label>
      </p>
      <p>
        <label>
          Email{" "}
          <input
            name="email"
            type="email"
            maxLength={320}
            autoComplete="off"
            defaultValue={customer?.email}
          />
        </label>
      </p>
      <p>
        <label>
          Phone{" "}
          <input
            name="phone"
            type="tel"
            maxLength={50}
            autoComplete="off"
            defaultValue={customer?.phone}
          />
        </label>
      </p>
      <p>
        <label>
          Address{" "}
          <textarea
            name="address"
            rows={3}
            maxLength={1000}
            autoComplete="off"
            defaultValue={customer?.address}
          />
        </label>
      </p>
    </>
  );
}

function CustomerList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const customers = useQuery(trpc.customers.list.queryOptions());
  const create = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.customers.list.queryKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(readFields(form), { onSuccess: () => form.reset() });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Customers
      </h1>
      {customers.error && <p role="alert">Unable to load customers: {customers.error.message}</p>}
      {customers.data?.length === 0 && <p>No customers yet. Add the first one below.</p>}
      <ul>
        {customers.data?.map((customer) => (
          <li key={customer.id}>
            <a href={`#/customers/${customer.id}`}>{customer.name}</a>
            {customer.email && ` · ${customer.email}`}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} aria-labelledby="new-customer">
        <h2 id="new-customer">Add a customer</h2>
        <CustomerFields />
        <button type="submit" disabled={create.isPending}>
          Add customer
        </button>
        {create.error && <p role="alert">Unable to add the customer: {create.error.message}</p>}
      </form>
    </main>
  );
}

function CustomerDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const customer = useQuery(trpc.customers.get.queryOptions({ id }));
  const update = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.customers.pathKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ id, ...readFields(event.currentTarget) });
  };

  return (
    <main>
      <p>
        <a href="#/customers">Back to customers</a>
      </p>
      {customer.error && <p role="alert">Unable to load this customer: {customer.error.message}</p>}
      {customer.data && (
        <form key={customer.data.id} onSubmit={onSubmit} aria-labelledby="customer-name">
          <h1 id="customer-name" ref={focusOnMount} tabIndex={-1}>
            {customer.data.name}
          </h1>
          <CustomerFields customer={customer.data} />
          <button type="submit" disabled={update.isPending}>
            Save customer
          </button>
          {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
        </form>
      )}
      <p role="status">{update.isSuccess ? "Saved" : ""}</p>
      <Slots name="customer" id={id} />
    </main>
  );
}

export function Customers() {
  const [, id] = useHashPath();
  return id ? <CustomerDetail key={id} id={Number(id)} /> : <CustomerList />;
}
