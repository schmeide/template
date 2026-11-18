import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { BoardDeal, BoardStage } from "../format.ts";

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

export const deal = (
  id: number,
  title: string,
  stageId: number,
  position: number,
  overrides: Partial<BoardDeal> = {}
): BoardDeal => ({
  id,
  title,
  stageId,
  position,
  owner: "",
  value: null,
  dueDate: null,
  customerName: null,
  ...overrides,
});

export const stage = (
  id: number,
  name: string,
  position: number,
  items: readonly BoardDeal[] = [],
  outcome: BoardStage["outcome"] = null
): BoardStage => ({
  id,
  name,
  position,
  outcome,
  items: [...items],
  count: items.length,
  total: items.reduce((sum, item) => sum + (item.value ?? 0), 0),
});

// A sales board: two deals in Lead, one in Qualified, an empty Won.
export const board = (): readonly BoardStage[] => [
  stage(1, "Lead", 0, [
    deal(10, "Acme renewal", 1, 0, { value: 12_000, owner: "Sam", customerName: "Acme Ltd" }),
    deal(11, "Globex pilot", 1, 1, { value: 3000 }),
  ]),
  stage(2, "Qualified", 1, [deal(12, "Initech upgrade", 2, 0, { dueDate: "2026-12-01" })]),
  stage(3, "Won", 2, [], "won"),
];
