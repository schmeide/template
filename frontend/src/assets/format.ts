import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

type Outputs = inferRouterOutputs<AppRouter>["assets"];
export type Asset = Outputs["get"];
export type Category = Outputs["categories"][number];
export type ImportCheck = Outputs["previewImport"];
export type Filter = inferRouterInputs<AppRouter>["assets"]["exportCsv"];
export type Status = Asset["status"];

// The statuses in menu order. Edit for the project.
export const statuses: readonly { readonly status: Status; readonly label: string }[] = [
  { status: "in_use", label: "In use" },
  { status: "in_storage", label: "In storage" },
  { status: "in_repair", label: "In repair" },
  { status: "lost", label: "Lost" },
];

export const statusLabel = (status: Status): string =>
  statuses.find((candidate) => candidate.status === status)?.label ?? status;

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
