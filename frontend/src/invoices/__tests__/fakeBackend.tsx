import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { inferRouterOutputs } from "@trpc/server";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";

export type Outputs = inferRouterOutputs<AppRouter>;
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

export const customer = {
  id: 1,
  name: "Acme Ltd",
  email: "billing@acme.example",
  phone: "",
  address: "1 Main St\nSpringfield",
  createdAt: new Date("2026-01-01"),
};

const line = (id: number, description: string, quantity: number, unitPrice: number) => ({
  id,
  documentId: 7,
  position: id - 1,
  description,
  quantity,
  unitPrice,
  taxRate: 1000,
  amount: Math.round((quantity * unitPrice) / 1000),
});

export const invoice = (overrides: Partial<Outputs["invoices"]["get"]> = {}) =>
  ({
    id: 7,
    type: "invoice",
    number: 7,
    reference: "INV-0007",
    customerId: 1,
    customer,
    issueDate: "2026-03-01",
    dueDate: "2026-03-31",
    status: "draft",
    notes: "Thank you for your business.",
    currency: "USD",
    shareToken: "6f1c2a4e-7d1b-4c55-9a43-0d6b1e2f3a4b",
    createdAt: new Date("2026-03-01"),
    lines: [line(1, "Labor", 2500, 4000), line(2, "Parts", 1000, 1999)],
    payments: [],
    subtotal: 11_999,
    tax: 1200,
    total: 13_199,
    paid: 0,
    balance: 13_199,
    ...overrides,
  }) satisfies Outputs["invoices"]["get"];

// Rounds like the server for the simple values these tests use.
export const fakeTotals = (input: {
  readonly lines: readonly { quantity: number; unitPrice: number; taxRate: number }[];
}) => {
  const nets = input.lines.map((line) => Math.round((line.quantity * line.unitPrice) / 1000));
  const subtotal = nets.reduce((sum, net) => sum + net, 0);
  const tax = input.lines.reduce(
    (sum, line, index) => sum + Math.round((nets[index] * line.taxRate) / 10_000),
    0
  );
  return { subtotal, tax, total: subtotal + tax };
};
