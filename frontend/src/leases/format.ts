import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";
import { currencyDigits, formatMoney, formatScaled, parseScaled } from "../money/money.ts";

type Outputs = inferRouterOutputs<AppRouter>["leases"];
export type Lease = Outputs["get"];
export type ListedLease = Outputs["list"][number];
export type Unit = Outputs["units"][number];
export type LeaseState = ListedLease["state"];
export type RentPeriod = Lease["rentPeriod"];

// Rent and deposits are in this currency. Edit for the project.
export const currency = "USD";

const digits = currencyDigits(currency);

export const formatAmount = (minor: number): string => formatMoney(minor, currency);
export const amountText = (minor: number): string => formatScaled(minor, digits);
// Undefined when the text is not an amount of zero or more in the currency.
export const parseAmount = (text: string): number | undefined => {
  const minor = parseScaled(text, digits);
  return minor === undefined || minor < 0 ? undefined : minor;
};

export const rentPeriods: readonly { readonly period: RentPeriod; readonly label: string }[] = [
  { period: "monthly", label: "Per month" },
  { period: "weekly", label: "Per week" },
];

export const formatRent = (rent: number, period: RentPeriod): string =>
  period === "weekly" ? `${formatAmount(rent)} a week` : `${formatAmount(rent)} a month`;

export const states: readonly { readonly state: LeaseState; readonly label: string }[] = [
  { state: "current", label: "Current" },
  { state: "upcoming", label: "Upcoming" },
  { state: "ended", label: "Ended" },
  { state: "cancelled", label: "Cancelled" },
];
