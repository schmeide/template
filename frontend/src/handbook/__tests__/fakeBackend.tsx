import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";

export type Call = { readonly path: string; readonly input: unknown };
type Handlers = Readonly<Record<string, (input: never) => unknown>>;

// Renders `ui` against a terminating link that answers each procedure from `handlers` and records
// every call it receives.
export const renderWithBackend = (ui: ReactNode, handlers: Handlers): readonly Call[] => {
  const calls: Call[] = [];
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        const handler = handlers[op.path];
        if (handler) {
          observer.next({ result: { data: handler(op.input as never) } });
          observer.complete();
        } else {
          observer.error(TRPCClientError.from(new Error(`No fake for ${op.path}`)));
        }
      });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({ links: [link] });
  render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {ui}
      </TRPCProvider>
    </QueryClientProvider>
  );
  return calls;
};

export const sam = { id: 1, name: "Sam" };
export const kim = { id: 2, name: "Kim" };

const updatedAt = new Date("2026-11-01T09:00:00Z");

export const row = (id: number, title: string, section: string, position: number) => ({
  id,
  title,
  section,
  position,
  trackReads: false,
  version: 1,
  updatedAt,
});

// The fire safety page in version 2, which Sam read in version 2 and Kim in version 1.
export const fireSafety = {
  ...row(5, "Fire safety", "Policies", 1),
  body: "# Exits\n\nKeep exits **clear**.",
  trackReads: true,
  version: 2,
  updatedById: sam.id,
  updatedByName: sam.name,
  readers: [
    { id: kim.id, name: kim.name, readVersion: 1, readAt: updatedAt },
    { id: sam.id, name: sam.name, readVersion: 2, readAt: updatedAt },
    { id: 3, name: "Dana", readVersion: null, readAt: null },
  ],
};
