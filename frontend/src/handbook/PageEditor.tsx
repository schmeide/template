import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { Person } from "../people/ActingAs.tsx";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, type Page } from "./format.ts";
import { Markdown } from "./markdown.tsx";

type Draft = Pick<Page, "title" | "section" | "body" | "trackReads">;

const blank: Draft = { title: "", section: "", body: "", trackReads: false };

function Form({ page, actor }: { readonly page?: Page; readonly actor: Person }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sections = useQuery(trpc.handbook.list.queryOptions());
  const [draft, setDraft] = useState<Draft>(page ?? blank);
  const options = {
    onSuccess: async (saved: { readonly id: number }) => {
      await queryClient.invalidateQueries({ queryKey: trpc.handbook.pathKey() });
      window.location.assign(`#/handbook/${saved.id}`);
    },
  };
  const create = useMutation(trpc.handbook.create.mutationOptions(options));
  const update = useMutation(trpc.handbook.update.mutationOptions(options));
  const save = page ? update : create;
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = {
      title: draft.title,
      section: draft.section,
      body: draft.body,
      trackReads: draft.trackReads,
      actorId: actor.id,
    };
    if (page) update.mutate({ id: page.id, version: page.version, ...values });
    else create.mutate(values);
  };

  return (
    <form onSubmit={onSubmit} className="handbook-editor">
      <div className="handbook-fields">
        <label>
          Title
          <input
            value={draft.title}
            required
            maxLength={200}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
        <label>
          Section
          <input
            value={draft.section}
            maxLength={100}
            list="handbook-sections"
            onChange={(event) => set({ section: event.target.value })}
          />
        </label>
        <datalist id="handbook-sections">
          {[...new Set(sections.data?.map((row) => row.section).filter(Boolean))].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label className="handbook-check">
          <input
            type="checkbox"
            checked={draft.trackReads}
            onChange={(event) => set({ trackReads: event.target.checked })}
          />
          Ask people to confirm they have read it
        </label>
      </div>
      <div className="handbook-panes">
        <label>
          Body (Markdown)
          <textarea
            value={draft.body}
            rows={20}
            maxLength={100_000}
            onChange={(event) => set({ body: event.target.value })}
          />
        </label>
        <section aria-label="Preview" className="handbook-preview">
          <h2 className="handbook-pane-title">Preview</h2>
          {draft.body.trim() === "" ? (
            <p className="handbook-muted">The page text shows here as you type.</p>
          ) : (
            <Markdown source={draft.body} />
          )}
        </section>
      </div>
      {save.error && <p role="alert">Unable to save the page: {save.error.message}</p>}
      <p className="handbook-actions">
        <button type="submit" disabled={save.isPending}>
          Save page
        </button>
        <a href={page ? `#/handbook/${page.id}` : "#/handbook"}>Cancel</a>
      </p>
    </form>
  );
}

// A new page, or an edit of page `id`, with a preview rendered as the reader will see it.
export function PageEditor({ id, actor }: { readonly id?: number; readonly actor?: Person }) {
  const trpc = useTRPC();
  const page = useQuery({
    ...trpc.handbook.get.queryOptions({ id: id ?? 0 }),
    enabled: id !== undefined,
  });
  const heading = id === undefined ? "New page" : "Edit page";

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {heading}
      </h1>
      {!actor ? (
        <p>Choose who you are acting as, or add your name, to write pages.</p>
      ) : page.error ? (
        <p role="alert">Unable to load the page: {page.error.message}</p>
      ) : id === undefined ? (
        <Form actor={actor} />
      ) : page.data ? (
        <Form key={page.data.version} page={page.data} actor={actor} />
      ) : (
        <p>Loading the page…</p>
      )}
    </main>
  );
}
