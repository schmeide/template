import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";

type Answers = Readonly<Record<string, unknown>>;

// The answer whose label is `label`, whatever its case, as text; empty when there is none.
export const answerFor = (answers: Answers, label: string): string => {
  const key = Object.keys(answers).find((candidate) => candidate.trim().toLowerCase() === label);
  const answer = key === undefined ? undefined : answers[key];
  return typeof answer === "string" || typeof answer === "number" ? String(answer) : "";
};

// Shown on a request, in the requests shape's "request" slot: "Add to customers" once the
// request is approved, then a link to the customer it was added to.
export function RequestCustomer({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its status changes.
  const request = useQuery(trpc.requests.get.queryOptions({ id }));
  const link = useQuery(trpc.requestCustomers.forRequest.queryOptions({ id }));
  const open = link.data === null && request.data?.status === "approved";
  const customers = useQuery({ ...trpc.customers.list.queryOptions(), enabled: open });
  const [choice, setChoice] = useState("new");
  const convert = useMutation(
    trpc.requestCustomers.convert.mutationOptions({
      onSuccess: async (customer) => {
        await queryClient.invalidateQueries({ queryKey: trpc.requestCustomers.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.customers.pathKey() });
        window.location.assign(`#/customers/${customer.id}`);
      },
      // Someone else may have added the customer first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.requestCustomers.pathKey() }),
    })
  );

  if (link.data) {
    return (
      <p>
        Added to customers as <a href={`#/customers/${link.data.id}`}>{link.data.name}</a>
      </p>
    );
  }
  if (!open || !request.data) return null;

  const answers = request.data.answers;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    convert.mutate(
      choice === "new"
        ? {
            requestId: id,
            customer: {
              name: String(data.get("name")),
              email: String(data.get("email")),
              phone: String(data.get("phone")),
              address: String(data.get("address")),
            },
          }
        : { requestId: id, customerId: Number(choice) }
    );
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="request-customer" className="request-form">
      <h2 id="request-customer">Add to customers</h2>
      <label>
        Customer{" "}
        <select value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="new">New customer from these answers</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.email ? `${customer.name}, ${customer.email}` : customer.name}
            </option>
          ))}
        </select>
      </label>
      {choice === "new" ? (
        // autoComplete is off: these are the customer's details, not the person typing them.
        <>
          <p>
            Check the details from the answers before saving. An existing customer is never found by
            email, since anyone can type one into the public form.
          </p>
          <label>
            Name{" "}
            <input
              name="name"
              required
              maxLength={200}
              autoComplete="off"
              defaultValue={answerFor(answers, "name") || request.data.contact}
            />
          </label>
          <label>
            Email{" "}
            <input
              name="email"
              type="email"
              maxLength={320}
              autoComplete="off"
              defaultValue={answerFor(answers, "email")}
            />
          </label>
          <label>
            Phone{" "}
            <input
              name="phone"
              type="tel"
              maxLength={50}
              autoComplete="off"
              defaultValue={answerFor(answers, "phone")}
            />
          </label>
          <label>
            Address{" "}
            <textarea
              name="address"
              rows={3}
              maxLength={1000}
              autoComplete="off"
              defaultValue={answerFor(answers, "address")}
            />
          </label>
        </>
      ) : null}
      <p className="request-actions">
        <button type="submit" disabled={convert.isPending}>
          {choice === "new" ? "Save customer" : "Link to customer"}
        </button>
      </p>
      {convert.error && <p role="alert">Unable to add to customers: {convert.error.message}</p>}
    </form>
  );
}

// Shown on a customer, in the customers shape's "customer" slot: the requests linked to them.
export function CustomerRequests({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const requests = useQuery(trpc.requestCustomers.forCustomer.queryOptions({ id }));

  if (!requests.data?.length) return null;
  return (
    <section aria-labelledby="customer-requests">
      <h2 id="customer-requests">Requests</h2>
      <ul>
        {requests.data.map((request) => (
          <li key={request.id}>
            <a href={`#/requests/${request.id}`}>
              {request.typeName} #{request.id}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
