import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend } from "../../assets/__tests__/fakeBackend.tsx";
import { BillRent, InvoiceRent, LeaseCharges } from "../RentCharges.tsx";

describe("BillRent", () => {
  it("bills rent up to the day chosen and links to each invoice made", async () => {
    const calls = renderWithBackend(<BillRent />, {
      "rentCharges.bill": () => [
        { id: 31, reference: "INV-0031" },
        { id: 32, reference: "INV-0032" },
      ],
    });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText("Bill rent up to"), { target: { value: "2026-04-30" } });
    await user.click(screen.getByRole("button", { name: "Bill rent" }));

    expect(await screen.findByText("Made 2 draft invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV-0032" })).toHaveAttribute("href", "#/invoices/32");
    expect(calls).toContainEqual({ path: "rentCharges.bill", input: { upTo: "2026-04-30" } });
  });

  it("says when nothing was due", async () => {
    renderWithBackend(<BillRent />, { "rentCharges.bill": () => [] });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Bill rent" }));

    expect(await screen.findByText(/No rent was due/)).toBeInTheDocument();
  });
});

describe("LeaseCharges", () => {
  it("lists a lease's periods with their invoice numbers and statuses", async () => {
    renderWithBackend(<LeaseCharges id={9} />, {
      "rentCharges.forLease": () => [
        {
          periodStart: "2026-01-31",
          periodEnd: "2026-02-27",
          invoice: { id: 31, reference: "INV-0031", status: "paid" },
        },
      ],
    });

    const row = (await screen.findByRole("link", { name: "INV-0031" })).closest("tr");
    expect(row).toHaveTextContent("Paid");
    expect(screen.getByRole("link", { name: "INV-0031" })).toHaveAttribute("href", "#/invoices/31");
  });

  it("points to Bill rent when nothing is billed yet", async () => {
    renderWithBackend(<LeaseCharges id={9} />, { "rentCharges.forLease": () => [] });

    expect(await screen.findByRole("link", { name: "Bill rent" })).toHaveAttribute(
      "href",
      "#/rent"
    );
  });
});

describe("InvoiceRent", () => {
  it("names the lease and period an invoice bills", async () => {
    renderWithBackend(<InvoiceRent id={31} />, {
      "rentCharges.forInvoice": () => ({
        leaseId: 9,
        unitName: "Flat 2",
        periodStart: "2026-01-31",
        periodEnd: "2026-02-27",
      }),
    });

    expect(await screen.findByRole("link", { name: "Flat 2" })).toHaveAttribute(
      "href",
      "#/leases/9"
    );
  });

  it("shows nothing on an invoice made by hand", async () => {
    const calls = renderWithBackend(<InvoiceRent id={31} />, {
      "rentCharges.forInvoice": () => null,
    });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
