import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoice, renderWithBackend } from "../../invoices/__tests__/fakeBackend.tsx";
import { DealDocuments } from "../DealDocuments.tsx";

const deal = (customerId: number | null) => ({ id: 10, title: "Boiler service", customerId });

const listed = [
  {
    id: 9,
    type: "invoice",
    reference: "INV-0009",
    status: "overdue",
    currency: "USD",
    total: 13_199,
  },
  { id: 3, type: "quote", reference: "Q-0003", status: "accepted", currency: "USD", total: 12_000 },
];

describe("DealDocuments", () => {
  beforeEach(() => {
    window.location.hash = "#/deals/10";
  });

  it("lists the deal's quotes and invoices with their status and total", async () => {
    renderWithBackend(<DealDocuments id={10} />, {
      "deals.get": () => deal(4),
      "dealDocuments.list": () => listed,
    });

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "INV-0009" })).toHaveAttribute(
      "href",
      "#/invoices/9"
    );
    expect(within(table).getByRole("link", { name: "Q-0003" })).toHaveAttribute(
      "href",
      "#/quotes/3"
    );
    expect(within(table).getByText("Overdue")).toBeInTheDocument();
    expect(within(table).getByText("$131.99")).toBeInTheDocument();
  });

  it("makes a quote for the deal and opens it for editing", async () => {
    const calls = renderWithBackend(<DealDocuments id={10} />, {
      "deals.get": () => deal(4),
      "dealDocuments.list": () => [],
      "dealDocuments.create": () => invoice({ id: 12, type: "quote", reference: "Q-0012" }),
    });

    expect(await screen.findByText("No quotes or invoices for this deal yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New quote" }));

    await waitFor(() => expect(window.location.hash).toBe("#/quotes/12/edit"));
    expect(calls.find((call) => call.path === "dealDocuments.create")?.input).toEqual({
      itemId: 10,
      type: "quote",
    });
  });

  it("asks for a contact before offering a new document", async () => {
    renderWithBackend(<DealDocuments id={10} />, {
      "deals.get": () => deal(null),
      "dealDocuments.list": () => [],
    });

    expect(
      await screen.findByText("Set a contact in Details to make a quote or invoice for this deal.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New invoice" })).not.toBeInTheDocument();
  });
});
