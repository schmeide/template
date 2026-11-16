import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppRouter } from "../../../backend/src/router.ts";
import { Notes } from "../Notes.tsx";
import { TRPCProvider } from "../trpc.ts";

type Note = { readonly id: number; readonly body: string; readonly createdAt: Date };

// A terminating link that answers from memory instead of the network.
const fakeBackend = (notes: Note[]): TRPCLink<AppRouter> => {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.path === "notes.create") {
          const { body } = op.input as { body: string };
          notes.unshift({ id: notes.length + 1, body, createdAt: new Date() });
          observer.next({ result: { data: notes[0] } });
        } else {
          observer.next({ result: { data: [...notes] } });
        }
        observer.complete();
      });
};

const renderNotes = (notes: Note[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({ links: [fakeBackend(notes)] });
  render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Notes />
      </TRPCProvider>
    </QueryClientProvider>
  );
};

describe("Notes", () => {
  it("lists existing notes and adds a new one", async () => {
    renderNotes([{ id: 1, body: "first note", createdAt: new Date() }]);

    expect(await screen.findByText("first note")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("New note"), "second note");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("second note")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("New note")).toHaveValue("");
  });
});
