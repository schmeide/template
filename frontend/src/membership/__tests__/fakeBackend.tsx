import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";

type Outputs = inferRouterOutputs<AppRouter>["membership"];
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

export const adult: Outputs["levels"][number] = {
  id: 1,
  name: "Adult",
  fee: 5000,
  months: 12,
  retired: false,
  createdAt: new Date("2030-01-01"),
};

export const customer = {
  id: 4,
  name: "Ada",
  email: "ada@example.com",
  phone: "",
  address: "",
  createdAt: new Date("2030-01-01"),
};

export const period: Outputs["member"]["periods"][number] = {
  id: 20,
  customerId: 4,
  levelId: 1,
  levelName: "Adult",
  fee: 5000,
  startsOn: "2030-01-01",
  endsOn: "2030-12-31",
  createdAt: new Date("2030-01-01"),
};
