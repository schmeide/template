import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";

// Shown on a request, in the requests shape's "request" slot: "Make deal" once the request is
// approved, then a link to the deal made from it.
export function RequestDeal({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its status changes.
  const request = useQuery(trpc.requests.get.queryOptions({ id }));
  const link = useQuery(trpc.requestDeals.forRequest.queryOptions({ id }));
  const open = link.data === null && request.data?.status === "approved";
  const customers = useQuery({ ...trpc.customers.list.queryOptions(), enabled: open });
  const [customerId, setCustomerId] = useState("");
  const convert = useMutation(
    trpc.requestDeals.convert.mutationOptions({
      onSuccess: async (deal) => {
        await queryClient.invalidateQueries({ queryKey: trpc.requestDeals.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.customers.pathKey() });
        window.location.assign(`#/deals/${deal.id}`);
      },
      // Someone else may have made the deal first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.requestDeals.pathKey() }),
    })
  );

  if (link.data) {
    return (
      <p>
        Made into deal <a href={`#/deals/${link.data.deal.id}`}>{link.data.deal.title}</a>
      </p>
    );
  }
  if (!open || !request.data) return null;

  const contact = request.data.contact || request.data.submitterName || "";
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    convert.mutate(
      customerId === "new"
        ? { requestId: id, customer: { name } }
        : { requestId: id, customerId: Number(customerId) }
    );
  };

  return (
    <form onSubmit={onSubmit} aria-labelledby="request-deal" className="request-form">
      <h2 id="request-deal">Make deal</h2>
      <label>
        Customer{" "}
        <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Choose a customer</option>
          <option value="new">New customer</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      {customerId === "new" && (
        <label>
          Name{" "}
          <input name="name" required maxLength={200} autoComplete="off" defaultValue={contact} />
        </label>
      )}
      <p className="request-actions">
        <button type="submit" disabled={convert.isPending}>
          Make deal
        </button>
      </p>
      {convert.error && <p role="alert">Unable to make the deal: {convert.error.message}</p>}
    </form>
  );
}

// Shown on a deal, in the deals shape's "deal" slot: the request it was made from.
export function DealSource({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const link = useQuery(trpc.requestDeals.forDeal.queryOptions({ id }));

  if (!link.data) return null;
  const { request } = link.data;
  return (
    <p>
      Made from request{" "}
      <a href={`#/requests/${request.id}`}>
        {request.typeName} #{request.id}
      </a>
    </p>
  );
}
