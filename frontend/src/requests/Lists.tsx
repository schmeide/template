import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatTime, statusLabels, type Outputs, type Person } from "./format.ts";

type Row = Outputs["list"][number];

function RequestTable({
  rows,
  caption,
}: {
  readonly rows: readonly Row[];
  readonly caption: string;
}) {
  return (
    <table className="request-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Request</th>
          <th scope="col">From</th>
          <th scope="col">Status</th>
          <th scope="col">Submitted</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <a href={`#/requests/${row.id}`}>
                {row.typeName} #{row.id}
              </a>
            </td>
            <td>{row.submitterName ?? row.contact}</td>
            <td>{statusLabels[row.status]}</td>
            <td>{row.submittedAt ? formatTime(row.submittedAt) : "Not yet"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MyRequests({ actor }: { readonly actor: Person }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.requests.list.queryOptions({ submitterId: actor.id }));

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        My requests
      </h1>
      {list.error && <p role="alert">Unable to load your requests: {list.error.message}</p>}
      {list.data?.length === 0 && (
        <p>
          You have no requests yet. <a href="#/requests/new">Start a new request</a>
        </p>
      )}
      {!!list.data?.length && <RequestTable rows={list.data} caption={`Filed by ${actor.name}`} />}
    </main>
  );
}

// Submitted requests this person may decide: not their own, and not ones whose type names another
// approver.
export function ReviewQueue({ actor }: { readonly actor: Person }) {
  const trpc = useTRPC();
  const list = useQuery(trpc.requests.list.queryOptions({ status: "submitted" }));
  const rows = (list.data ?? []).filter(
    (row) =>
      row.submitterId !== actor.id && (row.approverId === null || row.approverId === actor.id)
  );

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Review
      </h1>
      {list.error && <p role="alert">Unable to load the queue: {list.error.message}</p>}
      {list.data && rows.length === 0 && (
        <p>Nothing is waiting for you. Submitted requests you can decide show here.</p>
      )}
      {rows.length > 0 && <RequestTable rows={rows} caption={`Waiting for ${actor.name}`} />}
    </main>
  );
}
