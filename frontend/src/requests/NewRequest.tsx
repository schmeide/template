import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { AnswerFields, readAnswers } from "./AnswerFields.tsx";
import { focusOnMount, type Person } from "./format.ts";

const open = (id: number) => window.location.assign(`#/requests/${id}`);

export function NewRequest({ actor }: { readonly actor: Person }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const types = useQuery(trpc.requests.types.queryOptions());
  const [typeId, setTypeId] = useState<number>();
  const type = types.data?.find((candidate) => candidate.id === typeId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.requests.pathKey() });
  const create = useMutation(trpc.requests.create.mutationOptions({ onSuccess: refresh }));
  const submit = useMutation(trpc.requests.transition.mutationOptions({ onSuccess: refresh }));

  const save = (form: HTMLFormElement, andSubmit: boolean) => {
    if (!type) return;
    create.mutate(
      { typeId: type.id, actorId: actor.id, answers: readAnswers(form, type.fields) },
      {
        onSuccess: (request) =>
          andSubmit
            ? submit.mutate(
                { id: request.id, actorId: actor.id, to: "submitted" },
                { onSuccess: () => open(request.id) }
              )
            : open(request.id),
      }
    );
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save(event.currentTarget, true);
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        New request
      </h1>
      {types.error && <p role="alert">Unable to load request types: {types.error.message}</p>}
      <form onSubmit={onSubmit} aria-labelledby="request-what" className="request-form">
        <h2 id="request-what">What you are asking for</h2>
        <label>
          Type{" "}
          <select
            required
            value={typeId ?? ""}
            onChange={(event) => setTypeId(Number(event.target.value))}
          >
            <option value="" disabled>
              Choose a type
            </option>
            {types.data?.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        {type && (
          <>
            <AnswerFields key={type.id} fields={type.fields} />
            <p className="request-actions">
              <button type="submit" disabled={create.isPending || submit.isPending}>
                Submit request
              </button>
              <button
                type="button"
                disabled={create.isPending}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) save(form, false);
                }}
              >
                Save draft
              </button>
            </p>
          </>
        )}
        {create.error && <p role="alert">Unable to save: {create.error.message}</p>}
        {submit.error && create.data && (
          <p role="alert">
            Saved as a draft, but not submitted: {submit.error.message}{" "}
            <a href={`#/requests/${create.data.id}`}>Open the draft</a>
          </p>
        )}
      </form>
    </main>
  );
}
