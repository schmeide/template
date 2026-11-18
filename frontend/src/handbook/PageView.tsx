import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Person } from "../people/ActingAs.tsx";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatTime, sectionName, type Page } from "./format.ts";
import { Markdown } from "./markdown.tsx";

function Reads({ page, actor }: { readonly page: Page; readonly actor?: Person }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const confirm = useMutation(
    trpc.handbook.confirmRead.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: trpc.handbook.get.queryKey({ id: page.id }) }),
    })
  );
  const unread = page.readers.filter((reader) => reader.readVersion !== page.version);
  const mine = page.readers.find((reader) => reader.id === actor?.id);

  return (
    <section aria-labelledby="handbook-reads" className="handbook-reads">
      <h2 id="handbook-reads">Read confirmations</h2>
      {!actor ? (
        <p>Choose who you are acting as to confirm you have read this page.</p>
      ) : mine?.readVersion === page.version ? (
        <p>You have read this version.</p>
      ) : (
        <p>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({ id: page.id, version: page.version, actorId: actor.id })
            }
          >
            I have read this
          </button>
        </p>
      )}
      {confirm.error && <p role="alert">Unable to confirm: {confirm.error.message}</p>}
      {unread.length === 0 ? (
        <p>Everyone has read this version.</p>
      ) : (
        <>
          <h3 id="handbook-unread">Not read this version</h3>
          <ul aria-labelledby="handbook-unread">
            {unread.map((reader) => (
              <li key={reader.id}>
                {reader.name}
                {reader.readVersion !== null && " (read an earlier version)"}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="handbook-muted">
        A change to the title or text asks everyone to confirm again. Until sign-in exists, anyone
        can confirm under any name.
      </p>
    </section>
  );
}

export function PageView({ id, actor }: { readonly id: number; readonly actor?: Person }) {
  const trpc = useTRPC();
  const page = useQuery(trpc.handbook.get.queryOptions({ id }));

  if (page.error) {
    return (
      <main>
        <p role="alert">Unable to load the page: {page.error.message}</p>
        <a href="#/handbook">Back to the handbook</a>
      </main>
    );
  }
  if (!page.data) {
    return (
      <main aria-busy="true">
        <p>Loading the page…</p>
      </main>
    );
  }
  const data = page.data;

  return (
    <main>
      <p>
        <a href="#/handbook">Handbook</a> / {sectionName(data.section)}
      </p>
      <div className="handbook-title">
        <h1 ref={focusOnMount} tabIndex={-1}>
          {data.title}
        </h1>
        <a href={`#/handbook/${data.id}/edit`}>Edit page</a>
      </div>
      <p className="handbook-muted">
        Updated {formatTime(data.updatedAt)}
        {data.updatedByName && ` by ${data.updatedByName}`}
      </p>
      <Markdown source={data.body} />
      {data.trackReads && <Reads page={data} actor={actor} />}
    </main>
  );
}
