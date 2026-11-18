import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type DragEvent, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import {
  dealCount,
  focusOnMount,
  formatDate,
  formatValue,
  type BoardDeal,
  type BoardStage,
} from "./format.ts";

const allowDrop = (event: DragEvent) => event.preventDefault();

export function Board() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.deals.board.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
  const move = useMutation(trpc.deals.move.mutationOptions({ onSettled: refresh }));
  const create = useMutation(trpc.deals.create.mutationOptions({ onSuccess: refresh }));
  const [dragged, setDragged] = useState<BoardDeal>();
  const [announcement, setAnnouncement] = useState("");
  // A deal moved to another stage lands in a new column, so its link takes the focus there.
  const [landed, setLanded] = useState<number>();
  const stages = board.data ?? [];

  const moveTo = (deal: BoardDeal, to: BoardStage, position: number) => {
    const others = to.items.filter((item) => item.id !== deal.id).length;
    const place = Math.min(position, others) + 1;
    move.mutate(
      { id: deal.id, stageId: to.id, position },
      {
        onSuccess: () => {
          setAnnouncement(`${deal.title} moved to ${to.name}, ${place} of ${others + 1}`);
          setLanded(deal.stageId === to.id ? undefined : deal.id);
        },
      }
    );
  };

  const dropAt = (to: BoardStage, position: number) => (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragged) moveTo(dragged, to, position);
    setDragged(undefined);
  };

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = String(data.get("value"));
    create.mutate(
      {
        title: String(data.get("title")),
        stageId: Number(data.get("stageId")),
        value: value === "" ? null : Number(value),
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Deals
      </h1>
      {board.error && <p role="alert">Unable to load deals: {board.error.message}</p>}
      {stages.length > 0 && (
        <form onSubmit={onCreate} aria-labelledby="new-deal" className="deal-actions">
          <h2 id="new-deal">Add a deal</h2>
          <label>
            Title <input name="title" required maxLength={200} autoComplete="off" />
          </label>
          <label>
            Stage{" "}
            <select name="stageId" defaultValue={stages[0].id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Value <input name="value" type="number" min={0} step={1} inputMode="numeric" />
          </label>
          <button type="submit" disabled={create.isPending}>
            Add deal
          </button>
          {create.error && <p role="alert">Unable to add the deal: {create.error.message}</p>}
        </form>
      )}
      {move.error && <p role="alert">Unable to move the deal: {move.error.message}</p>}
      <p role="status" className="deal-announcer">
        {announcement}
      </p>
      <div className="deal-board">
        {stages.map((stage, stageIndex) => {
          const previous = stages[stageIndex - 1];
          const next = stages[stageIndex + 1];
          return (
            <section
              key={stage.id}
              aria-labelledby={`stage-${stage.id}`}
              className="deal-column"
              onDragOver={allowDrop}
              onDrop={dropAt(stage, stage.items.length)}
            >
              <h2 id={`stage-${stage.id}`}>{stage.name}</h2>
              <p className="deal-summary">
                {dealCount(stage.count)} · {formatValue(stage.total)}
              </p>
              {stage.items.length === 0 && <p className="deal-empty">No deals in this stage.</p>}
              <ol>
                {stage.items.map((deal, index) => (
                  <li
                    key={deal.id}
                    className="deal-card"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", String(deal.id));
                      setDragged(deal);
                    }}
                    onDragEnd={() => setDragged(undefined)}
                    onDragOver={allowDrop}
                    onDrop={dropAt(stage, index)}
                  >
                    <h3>
                      <a
                        href={`#/deals/${deal.id}`}
                        ref={deal.id === landed ? focusOnMount : undefined}
                      >
                        {deal.title}
                      </a>
                    </h3>
                    <dl>
                      {deal.customerName && (
                        <div>
                          <dt>Contact</dt>
                          <dd>{deal.customerName}</dd>
                        </div>
                      )}
                      {deal.value !== null && (
                        <div>
                          <dt>Value</dt>
                          <dd>{formatValue(deal.value)}</dd>
                        </div>
                      )}
                      {deal.owner && (
                        <div>
                          <dt>Owner</dt>
                          <dd>{deal.owner}</dd>
                        </div>
                      )}
                      {deal.dueDate && (
                        <div>
                          <dt>Due</dt>
                          <dd>{formatDate(deal.dueDate)}</dd>
                        </div>
                      )}
                    </dl>
                    <div role="group" aria-label={`Move ${deal.title}`} className="deal-moves">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveTo(deal, stage, index - 1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === stage.items.length - 1}
                        onClick={() => moveTo(deal, stage, index + 1)}
                      >
                        Down
                      </button>
                      {previous && (
                        <button
                          type="button"
                          onClick={() => moveTo(deal, previous, previous.items.length)}
                        >
                          To {previous.name}
                        </button>
                      )}
                      {next && (
                        <button type="button" onClick={() => moveTo(deal, next, next.items.length)}>
                          To {next.name}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </main>
  );
}
