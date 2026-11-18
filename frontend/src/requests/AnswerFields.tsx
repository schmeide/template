import type { Answer, Answers, Field } from "./format.ts";

// Inputs are named by position, since labels can hold any character.
const nameOf = (index: number) => `field-${index}`;

const Optional = ({ field }: { readonly field: Field }) =>
  field.required ? null : <span className="request-optional"> (optional)</span>;

function CheckField({
  field,
  index,
  answer,
}: {
  readonly field: Field;
  readonly index: number;
  readonly answer?: Answer;
}) {
  const current = typeof answer === "object" ? answer : undefined;
  return (
    <fieldset className="request-check">
      <legend>
        {field.label}
        <Optional field={field} />
      </legend>
      <label>
        <input
          type="radio"
          name={nameOf(index)}
          value="pass"
          required={field.required}
          defaultChecked={current?.result === "pass"}
        />{" "}
        Pass
      </label>
      <label>
        <input
          type="radio"
          name={nameOf(index)}
          value="fail"
          defaultChecked={current?.result === "fail"}
        />{" "}
        Fail
      </label>
      <label>
        Note (optional){" "}
        <input
          name={`${nameOf(index)}-note`}
          maxLength={500}
          autoComplete="off"
          defaultValue={current?.note}
        />
      </label>
    </fieldset>
  );
}

// One input per field, filled from `answers` when editing.
export function AnswerFields({
  fields,
  answers = {},
}: {
  readonly fields: readonly Field[];
  readonly answers?: Answers;
}) {
  return fields.map((field, index) => {
    const answer = answers[field.label];
    const value = typeof answer === "object" ? undefined : answer;
    const common = { name: nameOf(index), required: field.required, defaultValue: value };
    if (field.kind === "check") {
      return <CheckField key={field.label} field={field} index={index} answer={answer} />;
    }
    return (
      <label key={field.label}>
        {field.label}
        <Optional field={field} />{" "}
        {field.kind === "text" ? (
          <textarea {...common} rows={3} maxLength={2000} />
        ) : field.kind === "number" ? (
          <input {...common} type="number" step="any" inputMode="decimal" />
        ) : field.kind === "date" ? (
          <input {...common} type="date" />
        ) : (
          <select {...common} defaultValue={value ?? ""}>
            <option value="" disabled={field.required}>
              {field.required ? "Choose one" : "None"}
            </option>
            {field.options?.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        )}
      </label>
    );
  });
}

// The answers in `form` for `fields`, leaving out the ones left empty. The server checks them.
export const readAnswers = (form: HTMLFormElement, fields: readonly Field[]): Answers => {
  const data = new FormData(form);
  const entries = fields.flatMap((field, index): [string, Answer][] => {
    const value = String(data.get(nameOf(index)) ?? "").trim();
    if (field.kind === "check") {
      const note = String(data.get(`${nameOf(index)}-note`) ?? "").trim();
      return value === "pass" || value === "fail"
        ? [[field.label, note ? { result: value, note } : { result: value }]]
        : [];
    }
    if (value === "") return [];
    return [[field.label, field.kind === "number" ? Number(value) : value]];
  });
  return Object.fromEntries(entries);
};
