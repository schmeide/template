import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../backend/src/router.ts";

export type Outputs = inferRouterOutputs<AppRouter>["handbook"];
export type PageRow = Outputs["list"][number];
export type Page = Outputs["get"];

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const formatTime = (at: Date): string => timestamp.format(at);

export const sectionName = (section: string): string => section || "Other pages";

export const focusOnMount = (element: HTMLElement | null) => element?.focus();
