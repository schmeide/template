import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["stock"];
export type Balance = Outputs["balances"][number];
export type Item = Outputs["get"];
export type StockEntry = Item["entries"][number];
export type Kind = StockEntry["kind"];
export type SummaryRow = Outputs["summary"][number];

// The entry kinds in menu order, with what each means for stock. Edit for the project.
export const kinds: readonly { readonly kind: Kind; readonly label: string }[] = [
  { kind: "in", label: "In" },
  { kind: "out", label: "Out" },
  { kind: "adjust", label: "Adjustment" },
];

export const kindLabel = (kind: Kind): string =>
  kinds.find((candidate) => candidate.kind === kind)?.label ?? kind;

const plain = new Intl.NumberFormat();
const signed = new Intl.NumberFormat(undefined, { signDisplay: "exceptZero" });

// Quantities are whole units; the unit is free text such as "pcs" or "kg".
export const formatQuantity = (quantity: number, unit: string, withSign = false): string =>
  `${(withSign ? signed : plain).format(quantity)}${unit ? ` ${unit}` : ""}`;

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
export const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

const pad = (value: number) => String(value).padStart(2, "0");

// Today, or the first of this month, as a "YYYY-MM-DD" calendar day in local time.
export const localDay = (firstOfMonth = false): string => {
  const date = new Date();
  const day = firstOfMonth ? 1 : date.getDate();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(day)}`;
};

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
