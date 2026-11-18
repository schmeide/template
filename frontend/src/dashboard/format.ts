import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";
import { formatMoney } from "../money/money.ts";

export type Outputs = inferRouterOutputs<AppRouter>["dashboard"];
export type Series = Outputs["series"];
export type Point = Series["points"][number];

// The sample is in one currency. Edit for the project.
export const currency = "USD";
export const money = (cents: number): string => formatMoney(cents, currency);

const count = new Intl.NumberFormat();
export const formatCount = (value: number): string => count.format(value);

// Days are "YYYY-MM-DD" and months "YYYY-MM" calendar periods, so format them in UTC to keep them.
const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatPeriod = (period: string): string =>
  period.length === 7
    ? monthFormat.format(new Date(`${period}-01T00:00:00Z`))
    : dayFormat.format(new Date(`${period}T00:00:00Z`));
