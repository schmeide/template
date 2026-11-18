import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceEditor } from "../InvoiceEditor.tsx";
import { customer, fakeTotals, invoice, renderWithBackend } from "./fakeBackend.tsx";

const descriptions = () =>
  screen.getAllByLabelText(/^Description, line/).map((input) => (input as HTMLInputElement).value);

const totalsList = () => screen.getByRole("region", { name: "Totals" });

describe("InvoiceEditor", () => {
  beforeEach(() => {
    window.location.hash = "#/invoices/new";
  });

  it("builds lines with live totals and saves them in minor units", async () => {
    const calls = renderWithBackend(<InvoiceEditor />, {
      "customers.list": () => [customer],
      "invoices.totals": fakeTotals,
      "invoices.create": () => invoice({ id: 42 }),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Acme Ltd" });
    await user.selectOptions(screen.getByLabelText("Customer"), "Acme Ltd");
    await user.type(screen.getByLabelText("Description, line 1"), "Labor");
    await user.clear(screen.getByLabelText("Quantity, line 1"));
    await user.type(screen.getByLabelText("Quantity, line 1"), "2.5");
    await user.type(screen.getByLabelText("Unit price, line 1"), "40");
    await user.type(screen.getByLabelText("Tax %, line 1"), "10");

    await waitFor(() => expect(within(totalsList()).getByText("$110.00")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Description, line 2"), "Parts");
    await user.type(screen.getByLabelText("Unit price, line 2"), "19.99");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Description, line 3"), "Mistake");
    await user.click(screen.getByRole("button", { name: "Remove line 3" }));
    await user.click(screen.getByRole("button", { name: "Move line 2 up" }));

    expect(descriptions()).toEqual(["Parts", "Labor"]);
    await waitFor(() => expect(within(totalsList()).getByText("$129.99")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save invoice" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/42"));
    expect(calls.find((call) => call.path === "invoices.create")?.input).toMatchObject({
      customerId: 1,
      currency: "USD",
      lines: [
        { description: "Parts", quantity: 1000, unitPrice: 1999, taxRate: 0 },
        { description: "Labor", quantity: 2500, unitPrice: 4000, taxRate: 1000 },
      ],
    });
  });

  it("loads a draft for editing and saves changes to it", async () => {
    const calls = renderWithBackend(<InvoiceEditor id={7} />, {
      "customers.list": () => [customer],
      "invoices.get": () => invoice(),
      "invoices.totals": fakeTotals,
      "invoices.update": () => invoice(),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Edit INV-0007" })).toBeInTheDocument();
    expect(descriptions()).toEqual(["Labor", "Parts"]);
    expect(screen.getByLabelText("Quantity, line 1")).toHaveValue("2.5");
    expect(screen.getByLabelText("Unit price, line 2")).toHaveValue("19.99");

    await user.click(screen.getByRole("button", { name: "Move line 1 down" }));
    await user.click(screen.getByRole("button", { name: "Save invoice" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/7"));
    expect(calls.find((call) => call.path === "invoices.update")?.input).toMatchObject({
      id: 7,
      lines: [{ description: "Parts" }, { description: "Labor" }],
    });
  });

  it("points to the customers page when there are no customers", async () => {
    renderWithBackend(<InvoiceEditor />, {
      "customers.list": () => [],
      "invoices.totals": fakeTotals,
    });

    expect(await screen.findByRole("link", { name: "Add a customer" })).toHaveAttribute(
      "href",
      "#/customers"
    );
  });
});
