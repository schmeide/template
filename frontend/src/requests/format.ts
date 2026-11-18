import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["requests"];
export type { Person } from "../people/ActingAs.tsx";
export type RequestType = Outputs["types"][number];
export type Field = RequestType["fields"][number];
export type Detail = Outputs["get"];
export type Status = Detail["status"];
export type Answers = Detail["answers"];
export type Answer = Answers[string];

export const statusLabels: Readonly<Record<Status, string>> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for changes",
  withdrawn: "Withdrawn",
};

export const kindLabels: Readonly<Record<Field["kind"], string>> = {
  text: "Text",
  number: "Number",
  date: "Date",
  choice: "Choice",
  check: "Pass or fail",
};

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const formatTime = (at: Date): string => timestamp.format(at);

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

export const formatAnswer = (field: Field, answer: Answer | undefined): string => {
  if (answer === undefined || answer === "") return "Not answered";
  if (typeof answer === "object") {
    const result = answer.result === "pass" ? "Pass" : "Fail";
    return answer.note ? `${result}: ${answer.note}` : result;
  }
  if (field.kind === "date" && typeof answer === "string") {
    return day.format(new Date(`${answer}T00:00:00Z`));
  }
  return String(answer);
};

export const publicUrl = (token: string): string =>
  `${window.location.origin}${window.location.pathname}#/requests/form/${token}`;

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
