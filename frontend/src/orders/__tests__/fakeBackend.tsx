import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { Outputs, Product, ShopProduct } from "../format.ts";

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

export const tea = (overrides: Partial<ShopProduct> = {}): ShopProduct => ({
  id: 1,
  name: "Green tea",
  description: "Loose leaf, 100 g.",
  price: 450,
  taxRate: 0,
  imageUrl: "https://example.com/tea.png",
  category: "Drinks",
  ...overrides,
});

export const cake = (overrides: Partial<ShopProduct> = {}): ShopProduct => ({
  id: 2,
  name: "Lemon cake",
  description: "",
  price: 325,
  taxRate: 0,
  imageUrl: "",
  category: "Bakery",
  ...overrides,
});

export const shopOf = (products: readonly ShopProduct[]): Outputs["shop"] => ({
  currency: "USD",
  categories: ["Bakery", "Drinks"],
  products: [...products],
});

export const staffProduct = (overrides: Partial<Product> = {}): Product => ({
  ...tea(),
  active: true,
  createdAt: new Date("2026-03-01T10:00:00Z"),
  ...overrides,
});

export const order = (overrides: Partial<Outputs["get"]> = {}): Outputs["get"] => ({
  id: 7,
  number: 12,
  reference: "ORD-0012",
  status: "new",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  address: "12 Analytical Row",
  notes: "Leave at the door",
  currency: "USD",
  subtotal: 1225,
  tax: 0,
  total: 1225,
  token: "6f1c1a52-6a3e-4c1e-9d55-3d1d8f5b8e01",
  createdAt: new Date("2026-03-01T10:00:00Z"),
  lines: [
    {
      id: 1,
      orderId: 7,
      position: 0,
      productId: 1,
      name: "Green tea",
      unitPrice: 450,
      taxRate: 0,
      quantity: 2,
      amount: 900,
    },
    {
      id: 2,
      orderId: 7,
      position: 1,
      productId: 2,
      name: "Lemon cake",
      unitPrice: 325,
      taxRate: 0,
      quantity: 1,
      amount: 325,
    },
  ],
  ...overrides,
});
