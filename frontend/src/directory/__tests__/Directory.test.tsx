import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import type { Entry, Staff } from "../format.ts";
import { NewStaff, StaffDetail } from "../StaffPage.tsx";
import { StaffList } from "../StaffList.tsx";

type Call = { readonly path: string; readonly input: unknown };
type Handlers = Readonly<Record<string, (input: never) => unknown>>;

// Renders `ui` against a terminating link that answers each procedure from `handlers` and records
// every call it receives. A handler that throws fails the call with its message.
const renderWithBackend = (ui: ReactNode, handlers: Handlers): readonly Call[] => {
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

const entry = (personId: number, overrides: Partial<Entry> = {}): Entry => ({
  personId,
  email: "",
  phone: "",
  jobTitle: "",
  team: "",
  startsOn: null,
  leavesOn: null,
  notes: "",
  ...overrides,
});

const staff = (id: number, name: string, details: Entry | null = null): Staff => ({
  person: { id, name },
  entry: details,
});

describe("StaffList", () => {
  it("lists staff with their details and asks for former staff on request", async () => {
    const calls = renderWithBackend(<StaffList />, {
      "directory.teams": () => ["Finance"],
      "directory.list": (input: { former?: boolean }) =>
        input.former
          ? [staff(3, "Lee", entry(3, { leavesOn: "2026-01-31" }))]
          : [
              staff(1, "Ana", entry(1, { jobTitle: "Accountant", team: "Finance" })),
              staff(2, "Sam"),
            ],
    });
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Ana" })).toHaveAttribute(
      "href",
      "#/directory/1"
    );
    expect(within(table).getByText("Accountant")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Sam" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Show"), "Former staff");

    expect(await screen.findByRole("link", { name: "Lee" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Left" })).toBeInTheDocument();
    expect(calls).toContainEqual({
      path: "directory.list",
      input: expect.objectContaining({ former: true, today: expect.any(String) }),
    });
  });

  it("searches and filters by team, and offers to clear a filter that matches no one", async () => {
    const calls = renderWithBackend(<StaffList />, {
      "directory.teams": () => ["Finance", "Sales"],
      "directory.list": (input: { search?: string }) => (input.search ? [] : [staff(1, "Ana")]),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Sales" });
    await user.selectOptions(screen.getByLabelText("Team"), "Sales");
    await user.type(screen.getByLabelText("Search"), "nobody");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/No staff match “nobody”/)).toBeInTheDocument();
    expect(calls).toContainEqual({
      path: "directory.list",
      input: expect.objectContaining({ search: "nobody", team: "Sales", former: false }),
    });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("link", { name: "Ana" })).toBeInTheDocument();
  });
});

describe("NewStaff", () => {
  it("adds a person with their details and opens their page", async () => {
    window.location.hash = "#/directory/new";
    const calls = renderWithBackend(<NewStaff />, {
      "directory.add": () => staff(7, "Ana", entry(7)),
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Name"), "Ana");
    await user.type(screen.getByLabelText("Team"), "Finance");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-01" } });
    await user.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => expect(window.location.hash).toBe("#/directory/7"));
    expect(calls).toContainEqual({
      path: "directory.add",
      input: {
        name: "Ana",
        email: "ana@example.com",
        phone: "",
        jobTitle: "",
        team: "Finance",
        startsOn: "2026-07-01",
        leavesOn: null,
        notes: "",
      },
    });
  });
});

describe("StaffDetail", () => {
  it("saves a leaving date for a person with no details yet", async () => {
    const calls = renderWithBackend(<StaffDetail id={4} />, {
      "directory.get": () => staff(4, "Sam"),
      "directory.save": () => entry(4, { leavesOn: "2026-12-31" }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Sam", level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Leaving date"), { target: { value: "2026-12-31" } });
    await user.click(screen.getByRole("button", { name: "Save details" }));

    const form = screen.getByRole("form", { name: "Details" });
    expect(await within(form).findByRole("status")).toHaveTextContent("Saved");
    expect(calls).toContainEqual({
      path: "directory.save",
      input: {
        personId: 4,
        email: "",
        phone: "",
        jobTitle: "",
        team: "",
        startsOn: null,
        leavesOn: "2026-12-31",
        notes: "",
      },
    });
  });

  it("marks a person who has left as former staff", async () => {
    renderWithBackend(<StaffDetail id={3} />, {
      "directory.get": () => staff(3, "Lee", entry(3, { leavesOn: "2020-01-31" })),
    });

    expect(await screen.findByText(/Former staff: left on/)).toBeInTheDocument();
  });

  it("says when the person does not exist", async () => {
    renderWithBackend(<StaffDetail id={9} />, {
      "directory.get": () => {
        throw new Error("No person has that id");
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("No person has that id");
  });
});
