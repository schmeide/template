import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useState, type FormEvent } from "react";
import type { AppRouter } from "../../../backend/src/router.ts";
import { useTRPC } from "../trpc.ts";
import "./people.css";

export type Person = inferRouterOutputs<AppRouter>["people"]["list"][number];

const storageKey = "people.actingAs";

const readStored = (): number | undefined => {
  try {
    const id = Number(window.localStorage.getItem(storageKey));
    return Number.isInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
};

// The id of the person this browser acts as, kept in local storage, and a way to choose another.
// ponytail: anyone can act as anyone. Use the signed-in user instead once platform sign-in exists
// (schmeide/schmeide.app#84).
export const useActingAs = () => {
  const [actorId, setActorId] = useState(readStored);
  const choose = (id: number) => {
    setActorId(id);
    try {
      window.localStorage.setItem(storageKey, String(id));
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  };
  return [actorId, choose] as const;
};

// ponytail: a plain name picker standing in for sign-in, so any rule about who did what is only as
// strong as this choice. Replace it with the signed-in user once sign-in exists
// (schmeide/schmeide.app#84).
export function ActingAs({
  people,
  actorId,
  onChoose,
  hint,
}: {
  readonly people: readonly Person[];
  readonly actorId?: number;
  readonly onChoose: (id: number) => void;
  // What the choice is used for here, under the picker.
  readonly hint: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const add = useMutation(
    trpc.people.add.mutationOptions({
      onSuccess: async (person) => {
        await queryClient.invalidateQueries({ queryKey: trpc.people.list.queryKey() });
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
    <section aria-label="Who you are" className="people-actor">
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
      <form onSubmit={onAdd} aria-label="Add a name" className="people-add">
        <label>
          Name <input name="name" required maxLength={100} autoComplete="name" />
        </label>
        <button type="submit" disabled={add.isPending}>
          Add name
        </button>
      </form>
      {add.error && <p role="alert">Unable to add the name: {add.error.message}</p>}
      <p className="people-hint">{hint}</p>
    </section>
  );
}
