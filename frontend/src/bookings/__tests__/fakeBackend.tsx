import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { Outputs, Slot } from "../format.ts";

export type Call = { readonly path: string; readonly input: unknown };
type Handlers = Readonly<Record<string, (input: never) => unknown>>;

// Renders `ui` against a terminating link that answers each procedure from `handlers` and records
// every call it receives. A handler that throws answers with that error.
export const renderWithBackend = (ui: ReactNode, handlers: Handlers): readonly Call[] => {
  const calls: Call[] = [];
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        const handler = handlers[op.path];
        try {
          if (!handler) throw new Error(`No fake for ${op.path}`);
          observer.next({ result: { data: handler(op.input as never) } });
          observer.complete();
        } catch (error) {
          observer.error(
            TRPCClientError.from(error instanceof Error ? error : new Error("Failed"))
          );
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

export const ny = "America/New_York";

export const resources = (): Outputs["resources"] => [
  { id: 1, name: "Sam", kind: "Stylist", timeZone: ny },
];

export const services = (): Outputs["services"] => [
  { id: 5, name: "Cut", durationMinutes: 30, bufferMinutes: 0, capacity: 1 },
  { id: 6, name: "Yoga", durationMinutes: 60, bufferMinutes: 0, capacity: 10 },
];

export const slot = (startsAt: string, seatsLeft = 1): Slot => ({
  resourceId: 1,
  resourceName: "Sam",
  timeZone: ny,
  startsAt: new Date(startsAt),
  endsAt: new Date(Date.parse(startsAt) + 30 * 60_000),
  seatsLeft,
});
