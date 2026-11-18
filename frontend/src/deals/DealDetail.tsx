import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { Slots } from "../App.tsx";
import { useTRPC } from "../trpc.ts";
import { focusOnMount } from "./format.ts";

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function DealDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deal = useQuery(trpc.deals.get.queryOptions({ id }));
  const board = useQuery(trpc.deals.board.queryOptions());
  const customers = useQuery(trpc.customers.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
  const update = useMutation(trpc.deals.update.mutationOptions({ onSuccess: refresh }));
  const move = useMutation(trpc.deals.move.mutationOptions({ onSuccess: refresh }));
  const addNote = useMutation(trpc.deals.addNote.mutationOptions({ onSuccess: refresh }));

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name));
    update.mutate({
      id,
      title: text("title"),
      owner: text("owner"),
      value: text("value") === "" ? null : Number(text("value")),
      dueDate: text("dueDate") || null,
      customerId: text("customerId") === "" ? null : Number(text("customerId")),
    });
  };

  const onMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const stageId = Number(new FormData(event.currentTarget).get("stageId"));
    const stage = board.data?.find((candidate) => candidate.id === stageId);
    move.mutate({ id, stageId, position: stage?.items.length ?? 0 });
  };

  const onNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("note"));
    addNote.mutate({ itemId: id, text }, { onSuccess: () => form.reset() });
  };

  return (
    <main>
      <p>
        <a href="#/deals">Back to the board</a>
      </p>
      {deal.error && <p role="alert">Unable to load this deal: {deal.error.message}</p>}
      {deal.data && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {deal.data.title}
          </h1>
          <Slots name="deal" id={id} />
          <form onSubmit={onMove} className="deal-actions">
            <label>
              Stage{" "}
              <select key={deal.data.stage.id} name="stageId" defaultValue={deal.data.stage.id}>
                {board.data?.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={move.isPending}>
              Move
            </button>
            {move.error && <p role="alert">Unable to move: {move.error.message}</p>}
          </form>
          <form key={deal.data.id} onSubmit={onSave} aria-label="Details" className="deal-form">
            <h2>Details</h2>
            <label>
              Title{" "}
              <input
                name="title"
                required
                maxLength={200}
                autoComplete="off"
                defaultValue={deal.data.title}
              />
            </label>
            <label>
              Contact{" "}
              <select name="customerId" defaultValue={deal.data.customerId ?? ""}>
                <option value="">None</option>
                {customers.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Owner{" "}
              <input
                name="owner"
                maxLength={100}
                autoComplete="off"
                defaultValue={deal.data.owner}
              />
            </label>
            <label>
              Value{" "}
              <input
                name="value"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                defaultValue={deal.data.value ?? ""}
              />
            </label>
            <label>
              Due date <input name="dueDate" type="date" defaultValue={deal.data.dueDate ?? ""} />
            </label>
            <p>
              <button type="submit" disabled={update.isPending}>
                Save deal
              </button>
            </p>
            {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
            <p role="status">{update.isSuccess ? "Saved" : ""}</p>
          </form>
          <section aria-labelledby="activity">
            <h2 id="activity">Activity</h2>
            <form onSubmit={onNote}>
              <label>
                Note <textarea name="note" required rows={3} maxLength={2000} />
              </label>
              <p>
                <button type="submit" disabled={addNote.isPending}>
                  Add note
                </button>
              </p>
              {addNote.error && <p role="alert">Unable to add the note: {addNote.error.message}</p>}
            </form>
            {deal.data.activity.length === 0 ? (
              <p>No activity yet. Notes and stage changes show here.</p>
            ) : (
              <ol className="deal-activity">
                {deal.data.activity.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={entry.createdAt.toISOString()}>
                      {timestamp.format(entry.createdAt)}
                    </time>
                    <p className={entry.kind === "note" ? "deal-note" : undefined}>{entry.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}
