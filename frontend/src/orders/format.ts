import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["orders"];
export type ShopProduct = Outputs["shop"]["products"][number];
export type Product = Outputs["products"]["products"][number];
export type OrderStatus = Outputs["list"][number]["status"];

export const statuses: readonly { readonly value: OrderStatus; readonly label: string }[] = [
  { value: "new", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "ready", label: "Ready" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

export const statusLabel = (status: OrderStatus): string =>
  statuses.find((candidate) => candidate.value === status)?.label ?? status;

// The buttons staff see for each status. The server decides; this only offers the allowed steps.
export const nextSteps: Readonly<
  Record<OrderStatus, readonly { readonly to: OrderStatus; readonly label: string }[]>
> = {
  new: [
    { to: "accepted", label: "Accept" },
    { to: "cancelled", label: "Cancel order" },
  ],
  accepted: [
    { to: "ready", label: "Mark ready" },
    { to: "cancelled", label: "Cancel order" },
  ],
  ready: [
    { to: "fulfilled", label: "Mark fulfilled" },
    { to: "cancelled", label: "Cancel order" },
  ],
  fulfilled: [],
  cancelled: [],
};

// Only web links reach an <img>; the server refuses any other kind too.
export const imageSource = (url: string): string | undefined =>
  /^https?:\/\//i.test(url) ? url : undefined;

export const formatDate = (instant: Date): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(instant);

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
