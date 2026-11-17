import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, type BoardStage } from "./format.ts";

type Outcome = BoardStage["outcome"];
const outcomes = ["won", "lost"] as const;

const readStage = (form: HTMLFormElement) => {
  const data = new FormData(form);
  const outcome = String(data.get("outcome"));
  return {
    name: String(data.get("name")),
    outcome: outcomes.find((candidate) => candidate === outcome) ?? null,
  };
};

function StageFields({ name, outcome }: { readonly name?: string; readonly outcome?: Outcome }) {
  return (
    <>
      <label>
        Name <input name="name" required maxLength={100} autoComplete="off" defaultValue={name} />
      </label>
      <label>
        Closes as{" "}
        <select name="outcome" defaultValue={outcome ?? ""}>
          <option value="">Still open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </label>
    </>
  );
}

export function StageSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.deals.board.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
  const add = useMutation(trpc.deals.addStage.mutationOptions({ onSuccess: refresh }));
  const update = useMutation(trpc.deals.updateStage.mutationOptions({ onSuccess: refresh }));
  const move = useMutation(trpc.deals.moveStage.mutationOptions({ onSuccess: refresh }));
  const stages = board.data ?? [];
  const error = add.error ?? update.error ?? move.error;

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    add.mutate(readStage(form), { onSuccess: () => form.reset() });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Stages
      </h1>
      <p>Deals move through these stages from left to right on the board.</p>
      {board.error && <p role="alert">Unable to load stages: {board.error.message}</p>}
      {error && <p role="alert">Unable to save the stage: {error.message}</p>}
      <ol className="deal-stages">
        {stages.map((stage, index) => (
          <li key={stage.id}>
            <form
              aria-label={stage.name}
              className="deal-actions"
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate({ id: stage.id, ...readStage(event.currentTarget) });
              }}
            >
              <StageFields name={stage.name} outcome={stage.outcome} />
              <button type="submit">Save</button>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move.mutate({ id: stage.id, position: index - 1 })}
              >
                Up
              </button>
              <button
                type="button"
                disabled={index === stages.length - 1}
                onClick={() => move.mutate({ id: stage.id, position: index + 1 })}
              >
                Down
              </button>
            </form>
          </li>
        ))}
      </ol>
      <form onSubmit={onAdd} aria-labelledby="new-stage" className="deal-actions">
        <h2 id="new-stage">Add a stage</h2>
        <StageFields />
        <button type="submit" disabled={add.isPending}>
          Add stage
        </button>
      </form>
      <p role="status">{update.isSuccess ? "Saved" : ""}</p>
    </main>
  );
}
