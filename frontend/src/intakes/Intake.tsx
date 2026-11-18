import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useHashPath } from "../App.tsx";
import { AnswerFields, readAnswers } from "../requests/AnswerFields.tsx";
import { focusOnMount } from "../requests/format.ts";
import "../requests/requests.css";
import { useTRPC } from "../trpc.ts";

// The form behind a link sent to one customer. It needs no sign-in, so it only calls `form` and
// `submit`, which say nothing about the customer, not even their name.
function IntakeForm({ token }: { readonly token: string }) {
  const trpc = useTRPC();
  const form = useQuery(trpc.intakes.form.queryOptions({ token }));
  const send = useMutation(trpc.intakes.submit.mutationOptions());

  if (send.isSuccess) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Thanks, your form is in
        </h1>
        <p>We have your answers. You can close this page.</p>
      </main>
    );
  }
  if (form.error) {
    return (
      <main>
        <h1>This link is closed</h1>
        <p>
          Each link works once, and this one has been used or is not valid. Ask whoever sent it for
          a new link.
        </p>
      </main>
    );
  }
  if (!form.data) return <main aria-busy="true" />;
  const { name, fields } = form.data;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send.mutate({
      token,
      website: String(new FormData(event.currentTarget).get("website") ?? ""),
      answers: readAnswers(event.currentTarget, fields),
    });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {name}
      </h1>
      <form onSubmit={onSubmit} aria-labelledby="intake-form" className="request-form">
        <h2 id="intake-form">Your answers</h2>
        <AnswerFields fields={fields} />
        {/* A honeypot: people never see or reach it, so only a bot fills it in. */}
        <div className="request-trap" inert>
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p>
          <button type="submit" disabled={send.isPending}>
            Send form
          </button>
        </p>
        {send.error && <p role="alert">Unable to send: {send.error.message}</p>}
      </form>
    </main>
  );
}

// #/intake/<token> is the form; #/intake alone says where links come from.
// ponytail: the form still shows the app menu, as public intake does; with no sign-in every
// visitor is staff anyway. Once sign-in exists, serve it outside sign-in and without the menu.
export function Intake() {
  const [, token] = useHashPath();
  if (token) return <IntakeForm key={token} token={token} />;
  return (
    <main>
      <h1>Intake forms</h1>
      <p>
        Send one from a customer&rsquo;s page. Each link opens a form here, works once, and files
        the answers as a request on that customer.
      </p>
    </main>
  );
}
