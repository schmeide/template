import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { Detail, Person, RequestType } from "../format.ts";

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

export const sam: Person = { id: 1, name: "Sam" };
export const kim: Person = { id: 2, name: "Kim" };

export const leave: RequestType = {
  id: 7,
  name: "Leave",
  approverId: null,
  publicToken: null,
  fields: [
    { label: "Kind of leave", kind: "choice", required: true, options: ["Vacation", "Sick"] },
    { label: "First day", kind: "date", required: true },
    { label: "Note", kind: "text", required: false },
  ],
};

// A leave request Sam filed and submitted.
export const submitted = (overrides: Partial<Detail> = {}): Detail => ({
  id: 30,
  typeId: leave.id,
  typeName: leave.name,
  approverId: null,
  submitterId: sam.id,
  submitterName: sam.name,
  contact: "",
  fields: leave.fields,
  answers: { "Kind of leave": "Vacation", "First day": "2026-12-21" },
  status: "submitted",
  createdAt: new Date("2026-11-01T09:00:00Z"),
  submittedAt: new Date("2026-11-01T09:05:00Z"),
  decisions: [
    {
      id: 1,
      actorId: sam.id,
      actorName: sam.name,
      outcome: "submitted",
      comment: "",
      createdAt: new Date("2026-11-01T09:05:00Z"),
    },
  ],
  ...overrides,
});
