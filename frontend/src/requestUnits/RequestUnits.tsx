import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { statusLabels } from "../requests/format.ts";
import { useTRPC } from "../trpc.ts";
import "./requestUnits.css";

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

// Shown on a request, in the requests shape's "request" slot: the unit it is about, chosen from
// the units that are not archived, searched by name or tag. Any status may be filed.
export function RequestUnit({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const unit = useQuery(trpc.requestUnits.forRequest.queryOptions({ id }));
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState("");
  const matches = useQuery({
    ...trpc.assets.list.queryOptions({ search, pageSize: 10 }),
    enabled: search !== "",
  });
  const set = useMutation(
    trpc.requestUnits.set.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.requestUnits.pathKey() });
        setChoosing(false);
        setSearch("");
      },
    })
  );

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(String(new FormData(event.currentTarget).get("search")).trim());
  };

  if (unit.isPending) return null;

  return (
    <section aria-labelledby="request-unit" className="request-unit">
      <h2 id="request-unit">Unit</h2>
      {unit.error && <p role="alert">Unable to load the unit: {unit.error.message}</p>}
      {unit.data ? (
        <p>
          <a href={`#/assets/${unit.data.id}`}>{unit.data.name}</a>
          {unit.data.tag && ` (${unit.data.tag})`}
          {unit.data.archivedAt && " (archived)"}
        </p>
      ) : (
        !choosing && <p>Not filed against a unit yet.</p>
      )}
      {choosing || !unit.data ? (
        <>
          <form onSubmit={onSearch} role="search" aria-label="Units" className="request-unit-row">
            <label>
              Find a unit{" "}
              <input
                name="search"
                type="search"
                maxLength={200}
                autoComplete="off"
                placeholder="Flat 2"
                aria-describedby="request-unit-hint"
              />
            </label>
            <button type="submit">Search</button>
            {unit.data && (
              <button type="button" onClick={() => setChoosing(false)}>
                Keep {unit.data.name}
              </button>
            )}
          </form>
          <p id="request-unit-hint" className="request-unit-hint">
            Search by name or tag. Archived units are left out.
          </p>
          {matches.error && <p role="alert">Unable to search units: {matches.error.message}</p>}
          {matches.data?.rows.length === 0 && (
            <p>No units match &ldquo;{search}&rdquo;. Try part of the name or the tag.</p>
          )}
          {matches.data && matches.data.rows.length > 0 && (
            <ul className="request-unit-matches">
              {matches.data.rows.map((match) => (
                <li key={match.id}>
                  {match.name}
                  {match.tag && ` (${match.tag})`}{" "}
                  <button
                    type="button"
                    disabled={set.isPending}
                    onClick={() => set.mutate({ requestId: id, recordId: match.id })}
                  >
                    Choose {match.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="request-unit-row">
          <button type="button" onClick={() => setChoosing(true)}>
            Change unit
          </button>
          <button
            type="button"
            disabled={set.isPending}
            onClick={() => set.mutate({ requestId: id, recordId: null })}
          >
            Clear unit
          </button>
        </p>
      )}
      {set.error && <p role="alert">Unable to change the unit: {set.error.message}</p>}
    </section>
  );
}

// Shown on an asset, in the assets shape's "asset" slot: the requests filed against it.
export function UnitRequests({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const requests = useQuery(trpc.requestUnits.forUnit.queryOptions({ id }));

  return (
    <section aria-labelledby="unit-requests">
      <h2 id="unit-requests">Maintenance history</h2>
      {requests.error && (
        <p role="alert">Unable to load the maintenance history: {requests.error.message}</p>
      )}
      {requests.data?.length === 0 && (
        <p>No requests yet. Choose this unit on a request to add it here.</p>
      )}
      {requests.data && requests.data.length > 0 && (
        <div className="request-unit-scroll">
          <table className="request-unit-table">
            <thead>
              <tr>
                <th scope="col">Request</th>
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
                  <td>{request.submittedAt ? day.format(request.submittedAt) : "Not submitted"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
