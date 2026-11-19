import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { customer, invoice } from "../../invoices/__tests__/fakeBackend.tsx";
import { order, renderWithBackend } from "../../orders/__tests__/fakeBackend.tsx";
import { InvoiceOrder, OrderInvoice } from "../OrderInvoice.tsx";

describe("OrderInvoice", () => {
  beforeEach(() => {
    window.location.hash = "#/orders/7";
  });

  it("prefills the customer whose email matches and makes the invoice", async () => {
    const calls = renderWithBackend(<OrderInvoice id={7} />, {
      "orders.get": () => order({ status: "fulfilled" }),
      "orderInvoices.get": () => ({ invoice: null, customerId: 1 }),
      "customers.list": () => [customer],
      "orderInvoices.invoice": () => invoice({ id: 9 }),
    });

    expect(await screen.findByLabelText("Customer")).toHaveDisplayValue(
      "Acme Ltd (billing@acme.example)"
    );
    await userEvent.click(screen.getByRole("button", { name: "Make invoice" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/9"));
    expect(calls).toContainEqual({
      path: "orderInvoices.invoice",
      input: { orderId: 7, customerId: 1 },
    });
  });

  it("makes a new customer from the order when staff choose to", async () => {
    const calls = renderWithBackend(<OrderInvoice id={7} />, {
      "orders.get": () => order({ status: "fulfilled" }),
      "orderInvoices.get": () => ({ invoice: null, customerId: null }),
      "customers.list": () => [customer],
      "orderInvoices.invoice": () => invoice({ id: 9 }),
    });

    await userEvent.selectOptions(
      await screen.findByLabelText("Customer"),
      "New customer: Ada Lovelace"
    );
    await userEvent.click(screen.getByRole("button", { name: "Make invoice" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "orderInvoices.invoice", input: { orderId: 7 } })
    );
  });

  it("offers nothing before the order is fulfilled", async () => {
    const calls = renderWithBackend(<OrderInvoice id={7} />, {
      "orders.get": () => order({ status: "ready" }),
      "orderInvoices.get": () => ({ invoice: null, customerId: null }),
      "customers.list": () => [customer],
    });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("customers.list"));
    expect(screen.queryByRole("button", { name: "Make invoice" })).not.toBeInTheDocument();
  });

  it("links to the invoice once made", async () => {
    renderWithBackend(<OrderInvoice id={7} />, {
      "orders.get": () => order({ status: "fulfilled" }),
      "orderInvoices.get": () => ({ invoice: { id: 9, reference: "INV-0009" }, customerId: 1 }),
      "customers.list": () => [customer],
    });

    expect(await screen.findByRole("link", { name: "INV-0009" })).toHaveAttribute(
      "href",
      "#/invoices/9"
    );
  });
});

describe("InvoiceOrder", () => {
  it("links to the order the invoice was made from", async () => {
    renderWithBackend(<InvoiceOrder id={9} />, {
      "orderInvoices.order": () => ({ id: 7, reference: "ORD-0012" }),
    });

    expect(await screen.findByRole("link", { name: "ORD-0012" })).toHaveAttribute(
      "href",
      "#/orders/7"
    );
  });
});
