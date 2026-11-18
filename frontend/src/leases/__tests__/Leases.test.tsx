import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend } from "../../assets/__tests__/fakeBackend.tsx";
import type { Lease, ListedLease, Unit } from "../format.ts";
import { LeaseDetail } from "../LeaseDetail.tsx";
import { NewLease } from "../LeaseForm.tsx";
import { Leases } from "../Leases.tsx";

const tenants = [{ id: 4, name: "Pat Jones", email: "", phone: "", address: "", createdAt: "" }];
const units: Unit[] = [
  { id: 1, name: "Flat 1", tag: "F1", vacant: true },
  { id: 2, name: "Flat 2", tag: "", vacant: false },
];

const lease = (overrides: Partial<Lease> = {}): Lease => ({
  id: 9,
  recordId: 2,
  customerId: 4,
  firstDay: "2020-01-01",
  lastDay: null,
  rent: 125_000,
  rentPeriod: "monthly",
  deposit: 150_000,
  notes: "",
  cancelledAt: null,
  createdAt: new Date("2020-01-01T09:00:00Z"),
  unit: { id: 2, name: "Flat 2", tag: "", archivedAt: null },
  tenant: { id: 4, name: "Pat Jones" },
  ...overrides,
});

const listed = (id: number, state: ListedLease["state"], unitName: string): ListedLease => {
  const { unit, tenant, ...fields } = lease({ id });
  return { ...fields, unitName: unitName || unit.name, tenantName: tenant.name, state };
};

describe("NewLease", () => {
  it("lets the unit from the address to a tenant, with amounts in cents", async () => {
    window.location.hash = "#/leases/new/1";
    const calls = renderWithBackend(<NewLease />, {
      "leases.units": () => units,
      "customers.list": () => tenants,
      "leases.create": () => lease({ id: 12 }),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Pat Jones" });
    await waitFor(() => expect(screen.getByLabelText("Unit")).toHaveValue("1"));
    await user.selectOptions(screen.getByLabelText("Tenant"), "Pat Jones");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-07-01" } });
    await user.type(screen.getByLabelText("Rent"), "1250.50");
    await user.type(screen.getByLabelText("Deposit"), "1500");
    await user.click(screen.getByRole("button", { name: "Add lease" }));

    await waitFor(() => expect(window.location.hash).toBe("#/leases/12"));
    expect(calls).toContainEqual({
      path: "leases.create",
      input: {
        recordId: 1,
        customerId: 4,
        firstDay: "2026-07-01",
        lastDay: null,
        rent: 125_050,
        rentPeriod: "monthly",
        deposit: 150_000,
        notes: "",
      },
    });
  });

  it("asks for an amount it can read instead of sending one", async () => {
    window.location.hash = "#/leases/new";
    const calls = renderWithBackend(<NewLease />, {
      "leases.units": () => units,
      "customers.list": () => tenants,
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Flat 1 (F1)" });
    await user.selectOptions(screen.getByLabelText("Unit"), "Flat 1 (F1)");
    await user.selectOptions(screen.getByLabelText("Tenant"), "Pat Jones");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-07-01" } });
    await user.type(screen.getByLabelText("Rent"), "12,50");
    await user.click(screen.getByRole("button", { name: "Add lease" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the rent and deposit");
    expect(calls.map((call) => call.path)).not.toContain("leases.create");
  });
});

describe("Leases", () => {
  it("groups leases by state and filters them by tenant", async () => {
    window.location.hash = "#/leases";
    const calls = renderWithBackend(<Leases />, {
      "leases.units": () => units,
      "customers.list": () => tenants,
      "leases.list": () => [listed(3, "upcoming", "Flat 1"), listed(2, "current", "Flat 2")],
    });
    const user = userEvent.setup();

    const current = await screen.findByRole("table", { name: "Current" });
    expect(within(current).getByRole("link", { name: "Flat 2" })).toHaveAttribute(
      "href",
      "#/leases/2"
    );
    expect(screen.getByRole("table", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Ended" })).not.toBeInTheDocument();

    await screen.findByRole("option", { name: "Pat Jones" });
    await user.selectOptions(screen.getByLabelText("Tenant"), "Pat Jones");

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "leases.list").at(-1)?.input).toMatchObject({
        customerId: 4,
      })
    );
  });

  it("lists the vacant units with a link to let each", async () => {
    window.location.hash = "#/leases/vacant";
    renderWithBackend(<Leases />, { "leases.units": () => units });

    expect(await screen.findByRole("link", { name: "Let Flat 1" })).toHaveAttribute(
      "href",
      "#/leases/new/1"
    );
    expect(screen.queryByRole("link", { name: "Let Flat 2" })).not.toBeInTheDocument();
  });
});

describe("LeaseDetail", () => {
  it("ends a lease on a day", async () => {
    const calls = renderWithBackend(<LeaseDetail id={9} />, {
      "leases.get": () => lease(),
      "customers.list": () => tenants,
      "leases.end": () => lease({ lastDay: "2026-09-30" }),
    });

    const endForm = await screen.findByRole("form", { name: "End lease" });
    fireEvent.change(within(endForm).getByLabelText("Last day"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.submit(endForm);

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "leases.end", input: { id: 9, lastDay: "2026-09-30" } })
    );
  });

  it("cancels a lease that has not started, once confirmed", async () => {
    const calls = renderWithBackend(<LeaseDetail id={9} />, {
      "leases.get": () => lease({ firstDay: "2999-01-01" }),
      "customers.list": () => tenants,
      "leases.cancel": () => lease({ cancelledAt: new Date() }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Cancel lease" }));
    await user.click(screen.getByRole("button", { name: "Cancel this lease" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "leases.cancel")?.input).toMatchObject({ id: 9 })
    );
  });

  it("offers no cancel once a lease has started, and shows an archived unit", async () => {
    renderWithBackend(<LeaseDetail id={9} />, {
      "leases.get": () =>
        lease({
          unit: { id: 2, name: "Flat 2", tag: "", archivedAt: new Date("2026-03-01T09:00:00Z") },
        }),
      "customers.list": () => tenants,
    });

    expect(await screen.findByText(/archived/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel lease" })).not.toBeInTheDocument();
  });

  it("shows a cancelled lease with nothing to change", async () => {
    renderWithBackend(<LeaseDetail id={9} />, {
      "leases.get": () => lease({ cancelledAt: new Date("2026-03-01T09:00:00Z") }),
    });

    expect(await screen.findByText(/This lease was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save lease" })).not.toBeInTheDocument();
  });
});
