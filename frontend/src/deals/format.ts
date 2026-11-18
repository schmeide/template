import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["deals"];
export type BoardStage = Outputs["board"][number];
export type BoardDeal = BoardStage["items"][number];

// Deal values are whole units of this currency. Edit for the project.
export const currency = "USD";

export const formatValue = (value: number): string =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
export const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

export const dealCount = (count: number): string => (count === 1 ? "1 deal" : `${count} deals`);

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
