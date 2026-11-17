import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import {
  focusOnMount,
  kindLabels,
  publicUrl,
  type Field,
  type Person,
  type RequestType,
} from "./format.ts";

const kinds = Object.keys(kindLabels) as readonly Field["kind"][];

const blankField: Field = { label: "", kind: "text", required: false };

// Options are typed as one comma-separated list.
const splitOptions = (text: string) =>
  text
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);

function FieldRow({
  field,
  index,
  onChange,
  onRemove,
}: {
  readonly field: Field;
  readonly index: number;
  readonly onChange: (field: Field) => void;
  readonly onRemove: () => void;
}) {
  const [optionText, setOptionText] = useState(field.options?.join(", ") ?? "");
  return (
    <fieldset className="request-field">
      <legend>Field {index + 1}</legend>
      <label>
        Label{" "}
        <input
          required
          maxLength={100}
          autoComplete="off"
          value={field.label}
          onChange={(event) => onChange({ ...field, label: event.target.value })}
        />
      </label>
      <label>
        Kind{" "}
        <select
          value={field.kind}
          onChange={(event) => {
            const kind = kinds.find((candidate) => candidate === event.target.value) ?? "text";
            onChange({ ...field, kind });
          }}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabels[kind]}
            </option>
          ))}
        </select>
      </label>
      {field.kind === "choice" && (
        <label>
          Options{" "}
          <input
            required
            autoComplete="off"
            placeholder="Vacation, Sick, Personal"
            value={optionText}
            onChange={(event) => {
              setOptionText(event.target.value);
              onChange({ ...field, options: splitOptions(event.target.value) });
            }}
          />
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => onChange({ ...field, required: event.target.checked })}
        />{" "}
        Required
      </label>
      <button type="button" onClick={onRemove}>
        Remove field {index + 1}
      </button>
    </fieldset>
  );
}

// A type's name, approver and fields. A type made of pass or fail fields is a checklist.
function TypeEditor({
  type,
  people,
  onSave,
  saving,
  submitLabel,
}: {
  readonly type?: RequestType;
  readonly people: readonly Person[];
  readonly onSave: (input: {
    readonly name: string;
    readonly approverId: number | null;
    readonly fields: Field[];
  }) => Promise<unknown>;
  readonly saving: boolean;
  readonly submitLabel: string;
}) {
  const [fields, setFields] = useState<readonly Field[]>(type?.fields ?? [blankField]);
  // Each row keeps a stable key while rows are added and removed.
  const [keys, setKeys] = useState<readonly number[]>(() => fields.map((_, index) => index));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const approver = String(data.get("approverId"));
    void onSave({
      name: String(data.get("name")),
      approverId: approver === "" ? null : Number(approver),
      fields: [...fields],
    }).then(
      () => {
        if (type) return;
        form.reset();
        setFields([blankField]);
        setKeys([Math.max(0, ...keys) + 1]);
      },
      // The page shows the error from the mutation's state.
      () => undefined
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={type ? type.name : "New request type"}
      className="request-form"
    >
      <label>
        Name{" "}
        <input name="name" required maxLength={200} autoComplete="off" defaultValue={type?.name} />
      </label>
      <label>
        Approver{" "}
        <select name="approverId" defaultValue={type?.approverId ?? ""}>
          <option value="">Anyone but the person who filed it</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      {fields.map((field, index) => (
        <FieldRow
          key={keys[index]}
          field={field}
          index={index}
          onChange={(changed) => setFields(fields.map((old, at) => (at === index ? changed : old)))}
          onRemove={() => {
            setFields(fields.filter((_, at) => at !== index));
            setKeys(keys.filter((_, at) => at !== index));
          }}
        />
      ))}
      <p className="request-actions">
        <button
          type="button"
          onClick={() => {
            setFields([...fields, blankField]);
            setKeys([...keys, Math.max(0, ...keys) + 1]);
          }}
        >
          Add field
        </button>
        <button type="submit" disabled={saving}>
          {submitLabel}
        </button>
      </p>
    </form>
  );
}

function PublicLink({ type }: { readonly type: RequestType }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setPublic = useMutation(
    trpc.requests.setPublic.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.requests.types.queryKey() }),
    })
  );
  return (
    <div className="request-actions">
      <label>
        <input
          type="checkbox"
          checked={type.publicToken !== null}
          disabled={setPublic.isPending}
          onChange={(event) => setPublic.mutate({ id: type.id, open: event.target.checked })}
        />{" "}
        Take requests from anyone with the link
      </label>
      {type.publicToken && (
        <label>
          Public link <input readOnly size={40} value={publicUrl(type.publicToken)} />
        </label>
      )}
      {setPublic.error && <p role="alert">Unable to change the link: {setPublic.error.message}</p>}
    </div>
  );
}

export function TypeSettings({ people }: { readonly people: readonly Person[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const types = useQuery(trpc.requests.types.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.requests.types.queryKey() });
  const create = useMutation(trpc.requests.createType.mutationOptions({ onSuccess: refresh }));
  const update = useMutation(trpc.requests.updateType.mutationOptions({ onSuccess: refresh }));
  const error = create.error ?? update.error;

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Request types
      </h1>
      <p>
        Each type sets the questions a request asks and who approves it. Changing a type leaves
        requests already submitted as they were. A type made of pass or fail fields works as an
        inspection checklist.
      </p>
      {types.error && <p role="alert">Unable to load request types: {types.error.message}</p>}
      {error && <p role="alert">Unable to save the type: {error.message}</p>}
      {types.data?.map((type) => (
        <section key={type.id} aria-labelledby={`request-type-${type.id}`} className="request-type">
          <h2 id={`request-type-${type.id}`}>{type.name}</h2>
          <TypeEditor
            key={JSON.stringify([type.name, type.approverId, type.fields])}
            type={type}
            people={people}
            saving={update.isPending}
            submitLabel="Save type"
            onSave={(input) => update.mutateAsync({ id: type.id, ...input })}
          />
          <PublicLink type={type} />
        </section>
      ))}
      <section aria-labelledby="request-type-new" className="request-type">
        <h2 id="request-type-new">Add a request type</h2>
        <TypeEditor
          people={people}
          saving={create.isPending}
          submitLabel="Add type"
          onSave={(input) => create.mutateAsync(input)}
        />
      </section>
      <p role="status">{update.isSuccess ? "Saved" : ""}</p>
    </main>
  );
}
