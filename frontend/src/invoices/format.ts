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
};

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
