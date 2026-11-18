import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, formatValue } from "./format.ts";

const matches = (search: string, ...fields: readonly (string | null)[]) =>
  fields.some((field) => field?.toLocaleLowerCase().includes(search));

// Filters the board's deals in the browser: the board already loads every deal.
export function DealTable() {
  const trpc = useTRPC();
  const board = useQuery(trpc.deals.board.queryOptions());
  const [stageId, setStageId] = useState("");
  const [search, setSearch] = useState("");
  const stages = board.data ?? [];
  const query = search.trim().toLocaleLowerCase();
  const rows = stages
    .filter((stage) => stageId === "" || String(stage.id) === stageId)
    .flatMap((stage) => stage.items.map((deal) => ({ ...deal, stageName: stage.name })))
    .filter((deal) => matches(query, deal.title, deal.owner, deal.customerName));
  const filtered = stageId !== "" || query !== "";

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Deals
      </h1>
      <div className="deal-actions">
        <label>
          Stage{" "}
          <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
            <option value="">All</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search{" "}
          <input
            type="search"
            value={search}
            placeholder="Deal, contact or owner"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {board.error && <p role="alert">Unable to load deals: {board.error.message}</p>}
      {board.data &&
        rows.length === 0 &&
        (filtered ? (
          <p>
            No deals match these filters.{" "}
            <button
              type="button"
              onClick={() => {
                setStageId("");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          </p>
        ) : (
          <p>
            No deals yet. Add one on the <a href="#/deals">board</a>.
          </p>
        ))}
      {rows.length > 0 && (
        <div className="deal-scroll">
          <table className="deal-table">
            <thead>
              <tr>
                <th scope="col">Deal</th>
                <th scope="col">Stage</th>
                <th scope="col">Contact</th>
                <th scope="col">Owner</th>
                <th scope="col" className="amount">
                  Value
                </th>
                <th scope="col">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => (
                <tr key={deal.id}>
                  <td>
                    <a href={`#/deals/${deal.id}`}>{deal.title}</a>
                  </td>
                  <td>{deal.stageName}</td>
                  <td>{deal.customerName}</td>
                  <td>{deal.owner}</td>
                  <td className="amount">{deal.value !== null && formatValue(deal.value)}</td>
                  <td>{deal.dueDate && formatDate(deal.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
