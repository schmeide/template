import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, localDay, type Entry } from "./format.ts";

type Fields = Omit<Entry, "personId">;

// A person's details, for adding them or editing them. `children` holds the buttons and messages.
function StaffForm({
  entry,
  label,
  withName = false,
  onSubmit,
  children,
}: {
  readonly entry?: Entry | null;
  readonly label: string;
  readonly withName?: boolean;
  readonly onSubmit: (fields: Fields, name: string) => void;
  readonly children: ReactNode;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    onSubmit(
      {
        email: text("email"),
        phone: text("phone"),
        jobTitle: text("jobTitle"),
        team: text("team"),
        startsOn: text("startsOn") || null,
        leavesOn: text("leavesOn") || null,
        notes: text("notes"),
      },
      text("name")
    );
  };

  return (
    <form onSubmit={submit} aria-label={label} className="directory-form">
      <div className="directory-fields">
        {withName && (
          <label>
            Name <input name="name" required maxLength={100} autoComplete="off" />
          </label>
        )}
        <label>
          Job title{" "}
          <input
            name="jobTitle"
            maxLength={100}
            autoComplete="off"
            defaultValue={entry?.jobTitle}
          />
        </label>
        <label>
          Team{" "}
          <input
            name="team"
            maxLength={100}
            autoComplete="off"
            placeholder="Finance"
            defaultValue={entry?.team}
          />
        </label>
      </div>
      <div className="directory-fields">
        <label>
          Email{" "}
          <input
            name="email"
            type="email"
            maxLength={200}
            autoComplete="off"
            placeholder="ana@example.com"
            defaultValue={entry?.email}
          />
        </label>
        <label>
          Phone{" "}
          <input
            name="phone"
            type="tel"
            maxLength={50}
            autoComplete="off"
            defaultValue={entry?.phone}
          />
        </label>
      </div>
      <div className="directory-fields">
        <label>
          Start date <input name="startsOn" type="date" defaultValue={entry?.startsOn ?? ""} />
        </label>
        <label>
          Leaving date{" "}
          <input
            name="leavesOn"
            type="date"
            defaultValue={entry?.leavesOn ?? ""}
            aria-describedby="directory-leaving-hint"
          />
        </label>
      </div>
      <p id="directory-leaving-hint" className="directory-hint">
        The day after the leaving date, the person moves to former staff. They stay listed there, so
        their requests and read confirmations still name them.
      </p>
      <label className="directory-notes">
        Notes <textarea name="notes" maxLength={2000} rows={4} defaultValue={entry?.notes} />
      </label>
      <p className="directory-hint">
        Everyone with the app’s address can see these details, so leave out salary, bank, home
        address and health details.
      </p>
      {children}
    </form>
  );
}

export function NewStaff() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const add = useMutation(
    trpc.directory.add.mutationOptions({
      onSuccess: async ({ person }) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.directory.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.people.pathKey() }),
        ]);
        window.location.assign(`#/directory/${person.id}`);
      },
    })
  );

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Add a person
      </h1>
      <StaffForm
        label="New person"
        withName
        onSubmit={(fields, name) => add.mutate({ name, ...fields })}
      >
        <p>
          <button type="submit" disabled={add.isPending}>
            Add person
          </button>
        </p>
        {add.error && <p role="alert">Unable to add the person: {add.error.message}</p>}
      </StaffForm>
    </main>
  );
}

// One person: every field, editable. People are not renamed or deleted.
export function StaffDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const staff = useQuery(trpc.directory.get.queryOptions({ personId: id }));
  const save = useMutation(
    trpc.directory.save.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.directory.pathKey() }),
    })
  );
  const leavesOn = staff.data?.entry?.leavesOn;

  return (
    <main>
      <p>
        <a href="#/directory">Back to all staff</a>
      </p>
      {staff.error && <p role="alert">Unable to load this person: {staff.error.message}</p>}
      {staff.data && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {staff.data.person.name}
          </h1>
          {leavesOn && leavesOn < localDay() && (
            <p className="directory-former">Former staff: left on {formatDate(leavesOn)}.</p>
          )}
          <StaffForm
            entry={staff.data.entry}
            label="Details"
            onSubmit={(fields) => save.mutate({ personId: id, ...fields })}
          >
            <p>
              <button type="submit" disabled={save.isPending}>
                Save details
              </button>
            </p>
            {save.error && <p role="alert">Unable to save: {save.error.message}</p>}
            <p role="status">{save.isSuccess ? "Saved" : ""}</p>
          </StaffForm>
        </>
      )}
    </main>
  );
}
