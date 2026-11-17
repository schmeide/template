import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";

export function Notes() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const notes = useQuery(trpc.notes.list.queryOptions());
  const create = useMutation(
    trpc.notes.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.notes.list.queryKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body"));
    create.mutate({ body }, { onSuccess: () => form.reset() });
  };

  return (
    <main>
      <h1>Notes</h1>
      <form onSubmit={onSubmit}>
        <label>
          New note <input name="body" required />
        </label>
        <button type="submit" disabled={create.isPending}>
          Add
        </button>
      </form>
      {create.error && <p role="alert">Could not add the note: {create.error.message}</p>}
      {notes.error && <p role="alert">Could not load notes: {notes.error.message}</p>}
      <ul>
        {notes.data?.map((note) => (
          <li key={note.id}>{note.body}</li>
        ))}
      </ul>
    </main>
  );
}
