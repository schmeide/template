import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { formatDate, formatQuantity } from "../stock/format.ts";
import { useTRPC } from "../trpc.ts";

// The request type's field that names the kind of leave. A type without it is not leave.
const kindLabel = "Kind of leave";

// Shown on a request, in the requests shape's "request" slot: the balance it came off, or the
// balances its submitter's kinds of leave draw on and, once approved, "Take off balance".
export function RequestLeave({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its status changes.
  const request = useQuery(trpc.requests.get.queryOptions({ id }));
  const posting = useQuery(trpc.leave.forRequest.queryOptions({ requestId: id }));
  const kinds = request.data?.fields.find((field) => field.label === kindLabel)?.options;
  const personId = request.data?.submitterId ?? undefined;
  const open = posting.data === null && kinds !== undefined && personId !== undefined;
  const accounts = useQuery({
    ...trpc.leave.accounts.queryOptions({ personId: personId ?? 0 }),
    enabled: open,
  });
  const post = useMutation(
    trpc.leave.post.mutationOptions({
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.leave.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() }),
        ]),
    })
  );

  if (posting.data) {
    const { accountId, accountName, quantity, entryDate } = posting.data;
    return (
      <p>
        Taken off balance <a href={`#/stock/${accountId}`}>{accountName}</a>:{" "}
        {formatQuantity(-quantity, "days")} from {formatDate(entryDate)}.
      </p>
    );
  }
  if (!open || !request.data || !accounts.data || personId === undefined || !kinds) return null;

  const name = request.data.submitterName ?? "";
  const kind = request.data.answers[kindLabel];
  const drawsOn = accounts.data.find((row) => row.kind === kind);

  return (
    <section aria-labelledby="leave-heading" className="request-form">
      <h2 id="leave-heading">Leave balance</h2>
      {typeof kind === "string" &&
        (drawsOn ? (
          request.data.status === "approved" && (
            <p className="request-actions">
              <button
                type="button"
                disabled={post.isPending}
                onClick={() => post.mutate({ requestId: id })}
              >
                Take off balance
              </button>
            </p>
          )
        ) : (
          <p>
            {name}’s {kind} leave draws on no balance, so nothing comes off. Choose one below to
            count it.
          </p>
        ))}
      {post.error && <p role="alert">Unable to take it off: {post.error.message}</p>}
      <BalanceSettings personId={personId} name={name} kinds={kinds} current={accounts.data} />
    </section>
  );
}

// Which balance each kind of leave draws on for one person, picked from the stock items.
function BalanceSettings({
  personId,
  name,
  kinds,
  current,
}: {
  readonly personId: number;
  readonly name: string;
  readonly kinds: readonly string[];
  readonly current: readonly { readonly kind: string; readonly accountId: number }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const balances = useQuery(trpc.stock.balances.queryOptions());
  const setAccount = useMutation(trpc.leave.setAccount.mutationOptions());
  // One call per kind that changed; the form shows them as one save.
  const save = useMutation({
    mutationFn: (changes: readonly { kind: string; accountId: number | null }[]) =>
      Promise.all(changes.map((change) => setAccount.mutateAsync({ personId, ...change }))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.leave.pathKey() }),
  });
  const accountFor = (kind: string) => current.find((row) => row.kind === kind)?.accountId;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changes = kinds
      .map((kind) => {
        const value = String(data.get(kind) ?? "");
        return { kind, accountId: value ? Number(value) : null };
      })
      .filter(({ kind, accountId }) => (accountFor(kind) ?? null) !== accountId);
    save.mutate(changes);
  };

  return (
    <details>
      <summary>Choose {name}’s leave balances</summary>
      <form onSubmit={onSubmit} aria-label={`${name}’s leave balances`} className="request-form">
        {/* Keyed so the saved balances are selected once the options arrive. */}
        <div key={balances.data ? "loaded" : "loading"}>
          {kinds.map((kind) => (
            <p key={kind}>
              <label>
                {kind}{" "}
                <select name={kind} defaultValue={accountFor(kind) ?? ""}>
                  <option value="">No balance</option>
                  {balances.data?.map((balance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.name}
                    </option>
                  ))}
                </select>
              </label>
            </p>
          ))}
        </div>
        <p className="request-actions">
          <button type="submit" disabled={save.isPending}>
            Save balances
          </button>
        </p>
        {save.error && <p role="alert">Unable to save: {save.error.message}</p>}
        <p role="status">{save.isSuccess ? "Saved" : ""}</p>
      </form>
    </details>
  );
}

// Shown on a stock item, in the stock shape's "account" slot: whose leave it holds and the
// requests taken off it.
export function AccountLeave({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const leave = useQuery(trpc.leave.forAccount.queryOptions({ accountId: id }));

  if (!leave.data || (leave.data.drawnBy.length === 0 && leave.data.postings.length === 0)) {
    return null;
  }
  const { drawnBy, postings } = leave.data;
  return (
    <section aria-labelledby="account-leave">
      <h2 id="account-leave">Leave</h2>
      {drawnBy.map(({ personName, kind }) => (
        <p key={kind}>
          {personName}’s {kind} leave comes off this balance.
        </p>
      ))}
      {postings.length > 0 && (
        <ul>
          {postings.map(({ requestId, quantity, entryDate }) => (
            <li key={requestId}>
              <a href={`#/requests/${requestId}`}>Request #{requestId}</a>:{" "}
              {formatQuantity(-quantity, "days")} from {formatDate(entryDate)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
