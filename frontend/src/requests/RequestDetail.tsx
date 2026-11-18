import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Slots } from "../App.tsx";
import { useTRPC } from "../trpc.ts";
import { AnswerFields, readAnswers } from "./AnswerFields.tsx";
import {
  focusOnMount,
  formatAnswer,
  formatTime,
  statusLabels,
  type Detail,
  type Person,
} from "./format.ts";

const decisions = [
  { to: "approved", label: "Approve" },
  { to: "returned", label: "Return for changes" },
  { to: "rejected", label: "Reject" },
] as const;

// What the person acting may do with the request as it stands. The server checks the same rules.
const rolesFor = (request: Detail, actor: Person) => {
  const own = request.submitterId === actor.id;
  return {
    edit: own && (request.status === "draft" || request.status === "returned"),
    withdraw: own && ["draft", "returned", "submitted"].includes(request.status),
    decide:
      !own &&
      request.status === "submitted" &&
      (request.approverId === null || request.approverId === actor.id),
  };
};

export function RequestDetail({ id, actor }: { readonly id: number; readonly actor: Person }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const request = useQuery(trpc.requests.get.queryOptions({ id }));
  const types = useQuery(trpc.requests.types.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.requests.pathKey() });
  const update = useMutation(trpc.requests.update.mutationOptions({ onSuccess: refresh }));
  const move = useMutation(trpc.requests.transition.mutationOptions({ onSuccess: refresh }));
  const [comment, setComment] = useState("");
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (request.error) {
    return (
      <main>
        <p role="alert">Unable to load this request: {request.error.message}</p>
        <a href="#/requests">Back to my requests</a>
      </main>
    );
  }
  if (!request.data) return <main aria-busy="true" />;

  const detail = request.data;
  const roles = rolesFor(detail, actor);
  // An edit answers the type's questions as they stand now; the server copies them on save.
  const fields = types.data?.find((type) => type.id === detail.typeId)?.fields ?? detail.fields;
  const who = detail.submitterName ?? detail.contact;

  const save = (form: HTMLFormElement, andSubmit: boolean) =>
    update.mutate(
      { id, actorId: actor.id, answers: readAnswers(form, fields) },
      {
        onSuccess: () => {
          if (andSubmit) move.mutate({ id, actorId: actor.id, to: "submitted" });
        },
      }
    );

  const decide = (to: (typeof decisions)[number]["to"]) =>
    move.mutate({ id, actorId: actor.id, to, comment }, { onSuccess: () => setComment("") });

  return (
    <main>
      <p>
        <a href="#/requests">Back to my requests</a>
      </p>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {detail.typeName} #{detail.id} from {who}
      </h1>
      <p>
        Status: <strong>{statusLabels[detail.status]}</strong>
      </p>
      <Slots name="request" id={id} />

      {roles.edit ? (
        <form
          key={detail.status}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            save(event.currentTarget, true);
          }}
          aria-labelledby="request-answers"
          className="request-form"
        >
          <h2 id="request-answers">Answers</h2>
          <AnswerFields fields={fields} answers={detail.answers} />
          <p className="request-actions">
            <button type="submit" disabled={update.isPending || move.isPending}>
              Submit request
            </button>
            <button
              type="button"
              disabled={update.isPending}
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) save(form, false);
              }}
            >
              Save changes
            </button>
          </p>
          {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
        </form>
      ) : (
        <section aria-labelledby="request-answers">
          <h2 id="request-answers">Answers</h2>
          <dl className="request-answers">
            {detail.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{formatAnswer(field, detail.answers[field.label])}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {roles.decide && (
        <section aria-labelledby="request-decide">
          <h2 id="request-decide">Decide</h2>
          <label>
            Comment (optional){" "}
            <textarea
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="request-actions">
            {decisions.map(({ to, label }) => (
              <button key={to} type="button" disabled={move.isPending} onClick={() => decide(to)}>
                {label}
              </button>
            ))}
          </p>
        </section>
      )}
      {detail.status === "submitted" && detail.submitterId === actor.id && (
        <p>Someone else decides this request. You cannot approve your own.</p>
      )}
      {detail.status === "submitted" && !roles.decide && detail.submitterId !== actor.id && (
        <p>Only this request type&apos;s approver can decide it.</p>
      )}
      {roles.withdraw && !confirmingWithdraw && (
        <p>
          <button type="button" onClick={() => setConfirmingWithdraw(true)}>
            Withdraw request
          </button>
        </p>
      )}
      {roles.withdraw && confirmingWithdraw && (
        <div className="request-actions">
          <p>
            Withdraw this request? It can no longer be changed or decided. This cannot be undone.
          </p>
          <button
            type="button"
            disabled={move.isPending}
            onClick={() =>
              move.mutate(
                { id, actorId: actor.id, to: "withdrawn" },
                { onSuccess: () => setConfirmingWithdraw(false) }
              )
            }
          >
            Withdraw request
          </button>
          <button type="button" onClick={() => setConfirmingWithdraw(false)}>
            Keep request
          </button>
        </div>
      )}
      {move.error && <p role="alert">Unable to change the request: {move.error.message}</p>}
      <p role="status">
        {move.isSuccess
          ? `Status: ${statusLabels[detail.status]}`
          : update.isSuccess
            ? "Changes saved"
            : ""}
      </p>

      <section aria-labelledby="request-history">
        <h2 id="request-history">History</h2>
        {detail.decisions.length === 0 ? (
          <p>Not submitted yet. Each step shows here, newest first.</p>
        ) : (
          <ol className="request-history">
            {detail.decisions.map((step) => (
              <li key={step.id}>
                <strong>{statusLabels[step.outcome]}</strong> by{" "}
                {step.actorName ?? "the public form"},{" "}
                <time dateTime={step.createdAt.toISOString()}>{formatTime(step.createdAt)}</time>
                {step.comment && <p className="request-comment">{step.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
