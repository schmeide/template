import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["invoices"];
export type DisplayStatus = Outputs["get"]["status"];
export type PaymentMethod = inferRouterInputs<AppRouter>["invoices"]["recordPayment"]["method"];

export const statusLabels: Readonly<Record<DisplayStatus, string>> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
  expired: "Expired",
  accepted: "Accepted",
  declined: "Declined",
};

// What differs between the two document types on screen. `path` is also the router key.
export type Kind = {
  readonly type: Outputs["get"]["type"];
  readonly path: "invoices" | "quotes";
  readonly name: string;
  readonly title: string;
  readonly plural: string;
  readonly dueLabel: string;
  readonly dueDateLabel: string;
  readonly recipientLabel: string;
  readonly statuses: readonly DisplayStatus[];
  readonly example: string;
  readonly about: string;
};

export const kinds = {
  invoice: {
    type: "invoice",
    path: "invoices",
    name: "invoice",
    title: "Invoice",
    plural: "Invoices",
    dueLabel: "Due",
    dueDateLabel: "Due date",
    recipientLabel: "Bill to",
    statuses: ["draft", "sent", "overdue", "paid", "void"],
    example: "INV-0012",
    about: "An invoice bills a customer for work or goods. Create one to get started.",
  },
  quote: {
    type: "quote",
    path: "quotes",
    name: "quote",
    title: "Quote",
    plural: "Quotes",
    dueLabel: "Valid until",
    dueDateLabel: "Valid until",
    recipientLabel: "Prepared for",
    statuses: ["draft", "sent", "expired", "accepted", "declined", "void"],
    example: "Q-0012",
    about: "A quote tells a customer what the work will cost before they agree to it.",
  },
} as const satisfies Readonly<Record<Kind["type"], Kind>>;

export const methodLabels: Readonly<Record<PaymentMethod, string>> = {
  "bank transfer": "Bank transfer",
  card: "Card",
  cash: "Cash",
  check: "Check",
  other: "Other",
};

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
export const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

export const formatQuantity = (thousandths: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(thousandths / 1000);

export const formatTaxRate = (basisPoints: number): string =>
  new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }).format(
    basisPoints / 10_000
  );

// Today, or `days` from today, as a "YYYY-MM-DD" calendar day in local time.
export const localDay = (days = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
