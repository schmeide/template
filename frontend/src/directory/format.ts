import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Staff = inferRouterOutputs<AppRouter>["directory"]["get"];
export type Entry = NonNullable<Staff["entry"]>;

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
export const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

const pad = (value: number) => String(value).padStart(2, "0");

// Today as a "YYYY-MM-DD" calendar day in the viewer's time zone.
export const localDay = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
