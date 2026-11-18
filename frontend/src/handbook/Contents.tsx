import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, sectionName, type PageRow } from "./format.ts";

// The list arrives sorted by section, then position; this groups it by section.
const bySection = (rows: readonly PageRow[]) =>
  rows.reduce<readonly { readonly section: string; readonly pages: readonly PageRow[] }[]>(
    (groups, row) => {
      const last = groups.at(-1);
      return last?.section === row.section
        ? [...groups.slice(0, -1), { ...last, pages: [...last.pages, row] }]
        : [...groups, { section: row.section, pages: [row] }];
    },
    []
  );

function Section({
  section,
  pages,
}: {
  readonly section: string;
  readonly pages: readonly PageRow[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const headingId = useId();
  const move = useMutation(
    trpc.handbook.move.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.handbook.list.queryKey() }),
    })
  );

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{sectionName(section)}</h2>
      {move.error && <p role="alert">Unable to move the page: {move.error.message}</p>}
      <ol className="handbook-pages">
        {pages.map((page, index) => (
          <li key={page.id}>
            <a href={`#/handbook/${page.id}`}>{page.title}</a>
            <span className="handbook-move">
              {(["up", "down"] as const).map((direction) => {
                // aria-disabled rather than disabled, so focus stays on the button at the ends
                // and while a move is saving.
                const atEnd = direction === "up" ? index === 0 : index === pages.length - 1;
                return (
                  <button
                    key={direction}
                    type="button"
                    aria-label={`Move ${page.title} ${direction}`}
                    aria-disabled={atEnd}
                    onClick={() => {
                      if (!atEnd && !move.isPending) move.mutate({ id: page.id, direction });
                    }}
                  >
                    {direction === "up" ? "Up" : "Down"}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Every page by section, and search over titles and bodies as you type.
export function Contents() {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  const list = useQuery(trpc.handbook.list.queryOptions());
  const results = useQuery({ ...trpc.handbook.search.queryOptions({ query }), enabled: searching });

  return (
    <main>
      <div className="handbook-title">
        <h1 ref={focusOnMount} tabIndex={-1}>
          Handbook
        </h1>
        <a href="#/handbook/new">New page</a>
      </div>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label>
          Search the handbook{" "}
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </form>
      {list.error && <p role="alert">Unable to load the handbook: {list.error.message}</p>}
      {results.error && <p role="alert">Unable to search: {results.error.message}</p>}
      {searching ? (
        <section aria-label="Search results">
          <p role="status">
            {results.data &&
              (results.data.length === 0
                ? "No pages match. Try fewer or shorter words."
                : `${results.data.length} ${results.data.length === 1 ? "page matches" : "pages match"}`)}
          </p>
          <ul>
            {results.data?.map((page) => (
              <li key={page.id}>
                <a href={`#/handbook/${page.id}`}>{page.title}</a>{" "}
                <span className="handbook-muted">{sectionName(page.section)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        bySection(list.data ?? []).map((group) => <Section key={group.section} {...group} />)
      )}
    </main>
  );
}
