import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import type { Person } from "./format.ts";

// ponytail: a plain name picker standing in for sign-in, so the self-approval rule is only as strong
// as this choice. Replace it with the signed-in user once sign-in exists (schmeide/schmeide.app#84).
export function ActingAs({
  people,
  actorId,
  onChoose,
}: {
  readonly people: readonly Person[];
  readonly actorId?: number;
  readonly onChoose: (id: number) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const add = useMutation(
    trpc.requests.addPerson.mutationOptions({
      onSuccess: async (person) => {
        await queryClient.invalidateQueries({ queryKey: trpc.requests.people.queryKey() });
        onChoose(person.id);
      },
    })
  );

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    add.mutate({ name: String(new FormData(form).get("name")) }, { onSuccess: () => form.reset() });
  };

  return (
    <section aria-label="Who you are" className="request-actor">
      <label>
        Acting as{" "}
        <select value={actorId ?? ""} onChange={(event) => onChoose(Number(event.target.value))}>
          <option value="" disabled>
            Choose a name
          </option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={onAdd} aria-label="Add a name" className="request-actions">
        <label>
          Name <input name="name" required maxLength={100} autoComplete="name" />
        </label>
        <button type="submit" disabled={add.isPending}>
          Add name
        </button>
      </form>
      {add.error && <p role="alert">Unable to add the name: {add.error.message}</p>}
      <p className="request-hint">
        Until sign-in exists, anyone can pick any name. Nobody can approve a request filed under the
        same name.
      </p>
    </section>
  );
}
