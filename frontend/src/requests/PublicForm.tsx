import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { AnswerFields, readAnswers } from "./AnswerFields.tsx";
import { focusOnMount } from "./format.ts";

// The form behind a request type's public link. It needs no sign-in, so it only calls procedures
// that say nothing about other requests.
export function PublicForm({ token }: { readonly token: string }) {
  const trpc = useTRPC();
  const form = useQuery(trpc.requests.publicForm.queryOptions({ token }));
  const send = useMutation(trpc.requests.submitPublic.mutationOptions());

  if (form.error) {
    return (
      <main>
        <h1>This form is closed</h1>
        <p>The link is not open, or it has changed. Ask whoever sent it for the current link.</p>
      </main>
    );
  }
  if (!form.data) return <main aria-busy="true" />;
  const { name, fields } = form.data;

  if (send.isSuccess) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Thanks, your request is in
        </h1>
        <p>Someone will review it and get back to you at the contact you gave.</p>
        <p>
          <button type="button" onClick={() => send.reset()}>
            Send another
          </button>
        </p>
      </main>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    send.mutate({
      token,
      contact: String(data.get("contact")),
      website: String(data.get("website") ?? ""),
      answers: readAnswers(event.currentTarget, fields),
    });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {name}
      </h1>
      <form onSubmit={onSubmit} aria-labelledby="request-public" className="request-form">
        <h2 id="request-public">Your request</h2>
        <AnswerFields fields={fields} />
        <label>
          Your name and email or phone{" "}
          <input
            name="contact"
            required
            maxLength={200}
            autoComplete="on"
            placeholder="Pat Lee, pat@example.com"
          />
        </label>
        {/* A honeypot: people never see or reach it, so only a bot fills it in. */}
        <div className="request-trap" inert>
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p>
          <button type="submit" disabled={send.isPending}>
            Send request
          </button>
        </p>
        {send.error && <p role="alert">Unable to send: {send.error.message}</p>}
      </form>
    </main>
  );
}
