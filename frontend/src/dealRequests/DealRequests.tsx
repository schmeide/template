import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useActingAs } from "../people/ActingAs.tsx";
import { formatTime, statusLabels } from "../requests/format.ts";
import { useTRPC } from "../trpc.ts";

// Shown on a deal, in the deals shape's "deal" slot: the requests filed for it, and "New checklist",
// which starts a draft request of a type for the deal and opens it.
export function DealRequests({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const requests = useQuery(trpc.dealRequests.list.queryOptions({ id }));
  const types = useQuery(trpc.requests.types.queryOptions());
  const people = useQuery(trpc.people.list.queryOptions());
  const [actingAs, setActingAs] = useActingAs();
  const [typeId, setTypeId] = useState("");
  const [actorId, setActorId] = useState(actingAs === undefined ? "" : String(actingAs));
  const create = useMutation(
    trpc.dealRequests.create.mutationOptions({
      onSuccess: async (request) => {
        await queryClient.invalidateQueries({ queryKey: trpc.dealRequests.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.requests.pathKey() });
        window.location.assign(`#/requests/${request.id}`);
      },
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The request page opens acting as the same person, who may then fill in the draft.
    setActingAs(Number(actorId));
    create.mutate({ itemId: id, typeId: Number(typeId), actorId: Number(actorId) });
  };

  return (
    <section aria-labelledby="deal-requests">
      <h2 id="deal-requests">Checklists</h2>
      {requests.error && (
        <p role="alert">Unable to load the checklists: {requests.error.message}</p>
      )}
      {requests.data?.length === 0 && <p>No checklists for this deal yet.</p>}
      {requests.data && requests.data.length > 0 && (
        <div className="deal-scroll">
          <table className="deal-table">
            <thead>
              <tr>
                <th scope="col">Checklist</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {requests.data.map((request) => (
                <tr key={request.id}>
                  <td>
                    <a href={`#/requests/${request.id}`}>
                      {request.typeName} #{request.id}
                    </a>
                  </td>
                  <td>{statusLabels[request.status]}</td>
                  <td>{request.submittedAt ? formatTime(request.submittedAt) : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>New checklist</summary>
        {people.data?.length === 0 ? (
          <p>
            Add your name on the <a href="#/requests">Requests page</a> to start a checklist.
          </p>
        ) : (
          <form onSubmit={onSubmit} aria-label="New checklist" className="deal-form">
            <label>
              Type{" "}
              <select required value={typeId} onChange={(event) => setTypeId(event.target.value)}>
                <option value="" disabled>
                  Choose a type
                </option>
                {types.data?.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Acting as{" "}
              <select required value={actorId} onChange={(event) => setActorId(event.target.value)}>
                <option value="" disabled>
                  Choose a name
                </option>
                {people.data?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <button type="submit" disabled={create.isPending}>
                Start checklist
              </button>
            </p>
            {types.error && <p role="alert">Unable to load request types: {types.error.message}</p>}
            {create.error && (
              <p role="alert">Unable to start the checklist: {create.error.message}</p>
            )}
          </form>
        )}
      </details>
    </section>
  );
}

// Shown on a request, in the requests shape's "request" slot: the deal it was filed for.
export function RequestDealLink({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const deal = useQuery(trpc.dealRequests.deal.queryOptions({ id }));

  if (!deal.data) return null;
  return (
    <p>
      Filed for the deal <a href={`#/deals/${deal.data.id}`}>{deal.data.title}</a>
    </p>
  );
}
