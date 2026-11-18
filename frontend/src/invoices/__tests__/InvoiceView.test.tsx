import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { kinds } from "../format.ts";
import { InvoiceView, SharedInvoice } from "../InvoiceView.tsx";
import { invoice, renderWithBackend } from "./fakeBackend.tsx";

describe("InvoiceView", () => {
  it("shows a draft with its lines and totals, and marks it sent", async () => {
    const calls = renderWithBackend(<InvoiceView id={7} />, {
      "invoices.get": () => invoice(),
      "invoices.setStatus": () => invoice({ status: "sent" }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "INV-0007" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Labor" })).toBeInTheDocument();
    const totals = screen.getByRole("region", { name: "Totals" });
    expect(within(totals).getByText("$131.99")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit invoice" })).toHaveAttribute(
      "href",
      "#/invoices/7/edit"
    );
    expect(screen.queryByLabelText("Share link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as sent" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "invoices.setStatus")?.input).toEqual({
        id: 7,
        status: "sent",
      })
    );
  });

  it("asks before voiding", async () => {
    const calls = renderWithBackend(<InvoiceView id={7} />, {
      "invoices.get": () => invoice({ status: "sent" }),
      "invoices.setStatus": () => invoice({ status: "void" }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Void invoice" }));
    expect(screen.getByText(/Void INV-0007\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep invoice" }));
    expect(calls.some((call) => call.path === "invoices.setStatus")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Void invoice" }));
    await user.click(screen.getByRole("button", { name: "Void INV-0007" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "invoices.setStatus")?.input).toEqual({
        id: 7,
        status: "void",
      })
    );
  });

  it("shares a sent invoice and records a payment in minor units", async () => {
    const calls = renderWithBackend(<InvoiceView id={7} />, {
      "invoices.get": () => invoice({ status: "overdue" }),
      "invoices.recordPayment": () => ({}),
    });
    const user = userEvent.setup();

    expect(await screen.findByLabelText("Share link")).toHaveValue(
      `${window.location.origin}${window.location.pathname}#/invoices/share/${invoice().shareToken}`
    );
    expect(screen.getByLabelText("Amount")).toHaveValue("131.99");

    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "50.5");
    await user.selectOptions(screen.getByLabelText("Method"), "Card");
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "invoices.recordPayment")?.input).toMatchObject({
        documentId: 7,
        amount: 5050,
        method: "card",
      })
    );
  });
});

describe("InvoiceView for a quote", () => {
  it("shows the valid-until date, takes no payment, and marks a sent quote accepted", async () => {
    const quote = invoice({ type: "quote", reference: "Q-0007", status: "sent" });
    const calls = renderWithBackend(<InvoiceView id={7} kind={kinds.quote} />, {
      "quotes.get": () => quote,
      "quotes.setStatus": () => ({ ...quote, status: "accepted" }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Q-0007" })).toBeInTheDocument();
    expect(screen.getByText(/^Valid until/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prepared for" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to quotes" })).toHaveAttribute(
      "href",
      "#/quotes"
    );
    expect(screen.getByLabelText("Share link")).toHaveValue(
      `${window.location.origin}${window.location.pathname}#/quotes/share/${quote.shareToken}`
    );
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as declined" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark as accepted" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "quotes.setStatus")?.input).toEqual({
        id: 7,
        status: "accepted",
      })
    );
  });
});

describe("SharedInvoice", () => {
  it("shows the document without staff actions", async () => {
    const shared = Object.fromEntries(
      Object.entries(invoice({ status: "sent" })).filter(
        ([key]) => !["id", "shareToken"].includes(key)
      )
    );
    renderWithBackend(<SharedInvoice token="6f1c2a4e-7d1b-4c55-9a43-0d6b1e2f3a4b" />, {
      "invoices.shared": () => shared,
    });

    expect(await screen.findByRole("heading", { name: "INV-0007" })).toBeInTheDocument();
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void invoice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("explains a link that does not work", async () => {
    renderWithBackend(<SharedInvoice token="missing" />, {});

    expect(await screen.findByRole("alert")).toHaveTextContent("This invoice link is not valid");
  });
});
