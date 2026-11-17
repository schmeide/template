import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["bookings"];
export type Slot = Outputs["slots"][number];
export type CalendarBooking = Outputs["list"][number];
export type Status = CalendarBooking["status"];

export const statuses: readonly { readonly value: Status; readonly label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

export const statusLabel = (status: Status): string =>
  statuses.find((candidate) => candidate.value === status)?.label ?? status;

// Times show on the business's clock (the resource's zone), never the browser's. The zone's short
// name tells the two 1:30s apart on the day clocks go back.
export const formatTime = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);

// A "YYYY-MM-DD" calendar day, formatted in UTC so it stays the same day.
export const formatDay = (date: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );

// The calendar day an instant falls on in `timeZone`.
export const localDate = (instant: Date, timeZone: string): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

// The Monday on or before `date`.
export const weekStart = (date: string): string =>
  addDays(date, -((new Date(Date.parse(date)).getUTCDay() + 6) % 7));

export const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const minutes = (count: number): string =>
  new Intl.NumberFormat(undefined, { style: "unit", unit: "minute", unitDisplay: "long" }).format(
    count
  );

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
