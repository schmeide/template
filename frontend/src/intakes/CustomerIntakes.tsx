import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { formatTime, statusLabels } from "../requests/format.ts";
import { useTRPC } from "../trpc.ts";

export const intakeUrl = (token: string): string =>
  `${window.location.origin}${window.location.pathname}#/intake/${token}`;

// Shown on a customer, in the customers shape's "customer" slot: "Send intake form" makes a
// one-time link to copy into an email or message, and the list shows each form and what came back.
export function CustomerIntakes({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const types = useQuery(trpc.requests.types.queryOptions());
  const intakes = useQuery(trpc.intakes.list.queryOptions({ customerId: id }));
  const send = useMutation(
    trpc.intakes.send.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.intakes.pathKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typeId = Number(new FormData(event.currentTarget).get("type"));
    send.mutate({ customerId: id, typeId });
  };

  return (
    <section aria-labelledby="customer-intakes">
      <h2 id="customer-intakes">Intake forms</h2>
      <form onSubmit={onSubmit}>
        <label>
          Form{" "}
          <select name="type" required>
            {types.data?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit" disabled={send.isPending || !types.data}>
          Send intake form
        </button>
      </form>
      <p role="status">
        {send.isSuccess
          ? "Link made. Copy it from the top of the list into an email or message."
          : ""}
      </p>
      {send.error && <p role="alert">Unable to make the link: {send.error.message}</p>}
      {intakes.error && <p role="alert">Unable to load intake forms: {intakes.error.message}</p>}
      {intakes.data?.length === 0 && <p>No intake forms sent yet.</p>}
      <ul>
        {intakes.data?.map((intake) => (
          <li key={intake.token}>
            {intake.requestId === null ? (
              <label>
                {intake.typeName}, sent {formatTime(intake.createdAt)}, not filled in yet. Link{" "}
                <input readOnly size={40} value={intakeUrl(intake.token)} />
              </label>
            ) : (
              <>
                <a href={`#/requests/${intake.requestId}`}>{intake.typeName}</a>
                {intake.submittedAt && `, filled in ${formatTime(intake.submittedAt)}`}
                {intake.status && ` · ${statusLabels[intake.status]}`}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
