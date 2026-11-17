import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceList } from "../InvoiceList.tsx";
import { renderWithBackend, type Outputs } from "./fakeBackend.tsx";

const summary = (
  overrides: Partial<Outputs["invoices"]["list"][number]>
): Outputs["invoices"]["list"][number] => ({
  id: 1,
  type: "invoice",
  number: 1,
  reference: "INV-0001",
  status: "draft",
  issueDate: "2026-03-01",
  dueDate: "2026-03-31",
  currency: "USD",
  customerName: "Acme Ltd",
  total: 13_199,
  balance: 13_199,
  ...overrides,
});

describe("InvoiceList", () => {
  it("lists invoices and filters them by status and search", async () => {
    const calls = renderWithBackend(<InvoiceList />, {
      "invoices.list": () => [
        summary({}),
        summary({ id: 2, reference: "INV-0002", status: "overdue", customerName: "Globex" }),
      ],
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "INV-0002" })).toHaveAttribute(
      "href",
      "#/invoices/2"
    );
    expect(screen.getByRole("cell", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "$131.99" })).toHaveLength(4);

    await user.selectOptions(screen.getByLabelText("Status"), "Overdue");
    await user.type(screen.getByLabelText("Search"), "glob");

    await waitFor(() => expect(calls.at(-1)?.input).toEqual({ status: "overdue", search: "glob" }));
    expect(screen.getByRole("link", { name: "New invoice" })).toHaveAttribute(
      "href",
      "#/invoices/new"
    );
  });

  it("says when nothing matches and how to start", async () => {
    renderWithBackend(<InvoiceList />, { "invoices.list": () => [] });

    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
  });
});
