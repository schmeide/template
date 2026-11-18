import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { customer, invoice, renderWithBackend } from "../../invoices/__tests__/fakeBackend.tsx";
import { AccountBilling } from "../Billing.tsx";

const billing = { accountId: 4, customerId: 1, rate: 6000 };
const preview = {
  lines: [
    {
      entryId: 11,
      entryDate: "2026-03-02",
      description: "2026-03-02, Design",
      quantity: 1500,
      unitPrice: 6000,
      taxRate: 0,
      amount: 9000,
    },
    {
      entryId: 12,
      entryDate: "2026-03-20",
      description: "2026-03-20, Correction of entry 5",
      quantity: 500,
      unitPrice: -6000,
      taxRate: 0,
      amount: -3000,
    },
  ],
  total: 6000,
};

describe("AccountBilling", () => {
  beforeEach(() => {
    window.location.hash = "#/stock/4";
  });

  it("sets who the account is billed to and the hourly rate", async () => {
    const calls = renderWithBackend(<AccountBilling id={4} />, {
      "billing.get": () => null,
      "customers.list": () => [customer],
      "billing.set": () => ({ ...billing, rate: 7550 }),
    });

    await screen.findByRole("option", { name: "Acme Ltd" });
    await userEvent.selectOptions(screen.getByLabelText("Customer"), "Acme Ltd");
    await userEvent.type(screen.getByLabelText("Rate per hour"), "75.50");
    await userEvent.click(screen.getByRole("button", { name: "Save billing" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "billing.set")?.input).toEqual({
        accountId: 4,
        customerId: 1,
        rate: 7550,
      })
    );
  });

  it("shows nothing to bill until the customer and rate are set", async () => {
    const calls = renderWithBackend(<AccountBilling id={4} />, {
      "billing.get": () => null,
      "customers.list": () => [customer],
    });

    expect(await screen.findByText(/set the customer and rate/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create invoice" })).not.toBeInTheDocument();
    expect(calls.map((call) => call.path)).not.toContain("billing.preview");
  });

  it("previews the period, credits included, and makes the invoice", async () => {
    const calls = renderWithBackend(<AccountBilling id={4} />, {
      "billing.get": () => billing,
      "customers.list": () => [customer],
      "billing.preview": () => preview,
      "billing.bill": () => invoice({ id: 9 }),
    });

    expect(await screen.findByRole("cell", { name: "2026-03-02, Design" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "-$30.00" })).toBeInTheDocument();
    expect(screen.getByText("$60.00", { selector: "strong" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create invoice" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/9"));
    expect(calls.find((call) => call.path === "billing.bill")?.input).toMatchObject({
      accountId: 4,
    });
  });
});
