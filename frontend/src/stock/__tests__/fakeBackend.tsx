import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { Balance, Item, StockEntry } from "../format.ts";

export type Call = { readonly path: string; readonly input: unknown };
type Handlers = Readonly<Record<string, (input: never) => unknown>>;

// Renders `ui` against a terminating link that answers each procedure from `handlers` and records
// every call it receives. A handler that throws fails the call with its message.
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
          observer.error(TRPCClientError.from(error instanceof Error ? error : new Error("")));
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

export const balance = (id: number, name: string, overrides: Partial<Balance> = {}): Balance => ({
  id,
  name,
  unit: "pcs",
  floor: 0,
  lowAt: null,
  createdAt: new Date("2026-01-01"),
  balance: 0,
  low: false,
  ...overrides,
});

export const stockEntry = (
  id: number,
  quantity: number,
  overrides: Partial<StockEntry> = {}
): StockEntry => ({
  id,
  accountId: 1,
  kind: quantity > 0 ? "in" : "out",
  quantity,
  entryDate: "2026-03-10",
  who: "",
  note: "",
  reference: "",
  reverses: null,
  createdAt: new Date("2026-03-10T09:00:00Z"),
  reversedBy: null,
  ...overrides,
});

// Bolts: 12 received, 4 used, and a mistaken receipt of 5 that was reversed.
export const bolts = (): Item => ({
  ...balance(1, "Bolts", { lowAt: 10 }),
  balance: 8,
  entries: [
    stockEntry(4, -5, { kind: "in", reverses: 3, entryDate: "2026-03-12", note: "Wrong item" }),
    stockEntry(3, 5, { entryDate: "2026-03-11", reversedBy: 4 }),
    stockEntry(2, -4, { entryDate: "2026-03-10", who: "Sam" }),
    stockEntry(1, 12, { entryDate: "2026-03-09", reference: "PO-7" }),
  ],
});
