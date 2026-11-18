import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { focusOnMount, formatDate, localDay } from "../assets/format.ts";
import { useTRPC } from "../trpc.ts";
import { formatAmount, formatRent, states, type Lease } from "./format.ts";
import { LeaseForm } from "./LeaseForm.tsx";

const formatInstant = (instant: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(instant);

const span = (lease: Lease) =>
  lease.lastDay
    ? `${formatDate(lease.firstDay)} to ${formatDate(lease.lastDay)}`
    : `From ${formatDate(lease.firstDay)}, rolling`;

// One lease: its terms to edit, ending it on a day, and cancelling it before it starts.
export function LeaseDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const lease = useQuery(trpc.leases.get.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.leases.pathKey() });
  const update = useMutation(trpc.leases.update.mutationOptions({ onSuccess: refresh }));
  const end = useMutation(trpc.leases.end.mutationOptions({ onSuccess: refresh }));
  const cancel = useMutation(trpc.leases.cancel.mutationOptions({ onSuccess: refresh }));
  const [confirming, setConfirming] = useState(false);
  const today = localDay();

  const onEnd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    end.mutate({ id, lastDay: String(new FormData(event.currentTarget).get("endOn")) });
  };

  if (lease.error) {
    return (
      <main>
        <p>
          <a href="#/leases">Back to all leases</a>
        </p>
        <p role="alert">Unable to load this lease: {lease.error.message}</p>
      </main>
    );
  }
  if (!lease.data) return null;
  const { unit, tenant } = lease.data;
  const cancelled = lease.data.cancelledAt !== null;
  const upcoming = !cancelled && lease.data.firstDay > today;
  const state = cancelled
    ? "cancelled"
    : upcoming
      ? "upcoming"
      : lease.data.lastDay !== null && lease.data.lastDay < today
        ? "ended"
        : "current";

  return (
    <main>
      <p>
        <a href="#/leases">Back to all leases</a>
      </p>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {unit.name}
      </h1>
      <dl className="leases-summary">
        <dt>Tenant</dt>
        <dd>
          <a href={`#/customers/${tenant.id}`}>{tenant.name}</a>
        </dd>
        <dt>Unit</dt>
        <dd>
          <a href={`#/assets/${unit.id}`}>{unit.name}</a>
          {unit.archivedAt && ` (archived ${formatInstant(unit.archivedAt)})`}
        </dd>
        <dt>Dates</dt>
        <dd>{span(lease.data)}</dd>
        <dt>Rent</dt>
        <dd>{formatRent(lease.data.rent, lease.data.rentPeriod)}</dd>
        <dt>Deposit</dt>
        <dd>{formatAmount(lease.data.deposit)}</dd>
        <dt>Status</dt>
        <dd>{states.find((candidate) => candidate.state === state)?.label}</dd>
      </dl>

      {lease.data.cancelledAt ? (
        <p className="leases-notice">
          This lease was cancelled on {formatInstant(lease.data.cancelledAt)}. It stays on record
          and no longer holds the unit.
        </p>
      ) : (
        <>
          <h2>Terms</h2>
          {/* Keyed so a saved change resets the form to what was stored. */}
          <LeaseForm
            key={lease.dataUpdatedAt}
            lease={lease.data}
            label="Lease terms"
            onSubmit={(fields) => update.mutate({ id, ...fields })}
          >
            <p>
              <button type="submit" disabled={update.isPending}>
                Save lease
              </button>
            </p>
            {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
            <p role="status">{update.isSuccess ? "Saved" : ""}</p>
          </LeaseForm>

          <form onSubmit={onEnd} aria-labelledby="leases-end" className="leases-form">
            <h2 id="leases-end">End lease</h2>
            <p className="leases-hint" id="leases-end-hint">
              Sets the last day, or moves it earlier. To extend the lease, change its last day
              above.
            </p>
            <div className="leases-fields">
              <label>
                Last day{" "}
                <input
                  name="endOn"
                  type="date"
                  required
                  min={lease.data.firstDay}
                  max={lease.data.lastDay ?? undefined}
                  aria-describedby="leases-end-hint"
                />
              </label>
              <button type="submit" disabled={end.isPending}>
                End lease
              </button>
            </div>
            {end.error && <p role="alert">Unable to end the lease: {end.error.message}</p>}
            <p role="status">{end.isSuccess ? "Lease ended" : ""}</p>
          </form>

          {upcoming && (
            <section aria-labelledby="leases-cancel" className="leases-form">
              <h2 id="leases-cancel">Cancel lease</h2>
              <p className="leases-hint">
                For a lease entered by mistake. It has not started, so cancelling frees the unit and
                keeps this lease on record as cancelled. This cannot be undone.
              </p>
              {confirming ? (
                <p className="leases-buttons">
                  <button
                    ref={focusOnMount}
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate({ id, today })}
                  >
                    Cancel this lease
                  </button>
                  <button type="button" onClick={() => setConfirming(false)}>
                    Keep lease
                  </button>
                </p>
              ) : (
                <p>
                  <button type="button" onClick={() => setConfirming(true)}>
                    Cancel lease
                  </button>
                </p>
              )}
              {cancel.error && (
                <p role="alert">Unable to cancel the lease: {cancel.error.message}</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
