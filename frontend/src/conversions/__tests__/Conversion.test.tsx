import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoice, renderWithBackend } from "../../invoices/__tests__/fakeBackend.tsx";
import { InvoiceSource, QuoteConversion } from "../Conversion.tsx";

const quote = (status: "sent" | "accepted") =>
  invoice({ id: 3, type: "quote", reference: "Q-0003", status });
const link = {
  quote: { id: 3, reference: "Q-0003" },
  invoice: { id: 9, reference: "INV-0009" },
};

describe("QuoteConversion", () => {
  beforeEach(() => {
    window.location.hash = "#/quotes/3";
  });

  it("makes an accepted quote into an invoice and opens it", async () => {
    const calls = renderWithBackend(<QuoteConversion id={3} />, {
      "quotes.get": () => quote("accepted"),
      "conversions.get": () => null,
      "conversions.convert": () => invoice({ id: 9 }),
    });

    await userEvent.click(await screen.findByRole("button", { name: "Make invoice" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/9"));
    expect(calls.find((call) => call.path === "conversions.convert")?.input).toEqual({
      quoteId: 3,
    });
  });

  it("offers nothing before the quote is accepted", async () => {
    const calls = renderWithBackend(<QuoteConversion id={3} />, {
      "quotes.get": () => quote("sent"),
      "conversions.get": () => null,
    });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("conversions.get"));
    expect(screen.queryByRole("button", { name: "Make invoice" })).not.toBeInTheDocument();
  });

  it("links to the invoice once it exists", async () => {
    renderWithBackend(<QuoteConversion id={3} />, {
      "quotes.get": () => quote("accepted"),
      "conversions.get": () => link,
    });

    expect(await screen.findByRole("link", { name: "INV-0009" })).toHaveAttribute(
      "href",
      "#/invoices/9"
    );
    expect(screen.queryByRole("button", { name: "Make invoice" })).not.toBeInTheDocument();
  });
});

describe("InvoiceSource", () => {
  it("links an invoice to the quote it was made from", async () => {
    renderWithBackend(<InvoiceSource id={9} />, { "conversions.get": () => link });

    expect(await screen.findByRole("link", { name: "Q-0003" })).toHaveAttribute(
      "href",
      "#/quotes/3"
    );
  });
});
