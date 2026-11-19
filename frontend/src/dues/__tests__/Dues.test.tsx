import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend } from "../../membership/__tests__/fakeBackend.tsx";
import { InvoicePeriod, PeriodDues } from "../Dues.tsx";

const invoice = { id: 31, reference: "INV-0031" };

describe("PeriodDues", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("bills an unbilled period and opens the invoice", async () => {
    const calls = renderWithBackend(<PeriodDues id={20} />, {
      "dues.forPeriod": () => ({ state: "unbilled", invoice: null, billable: true }),
      "dues.bill": () => ({ id: 31 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/Dues unbilled/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Bill dues" }));

    await waitFor(() => expect(window.location.hash).toBe("#/invoices/31"));
    expect(calls.find((call) => call.path === "dues.bill")?.input).toEqual({ periodId: 20 });
  });

  it("links a billed or paid period to its invoice, and offers nothing with no fee", async () => {
    renderWithBackend(
      <>
        <PeriodDues id={20} />
        <PeriodDues id={21} />
      </>,
      {
        "dues.forPeriod": ({ id }: { readonly id: number }) =>
          id === 20
            ? { state: "paid", invoice, billable: true }
            : { state: "unbilled", invoice: null, billable: false },
      }
    );

    expect(await screen.findByText(/Dues paid on/)).toBeVisible();
    expect(screen.getByRole("link", { name: "INV-0031" })).toHaveAttribute("href", "#/invoices/31");
    expect(await screen.findByText("No dues to bill")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Bill dues" })).not.toBeInTheDocument();
  });
});

describe("InvoicePeriod", () => {
  it("links an invoice to the member whose period it bills", async () => {
    renderWithBackend(<InvoicePeriod id={31} />, {
      "dues.forInvoice": () => ({
        id: 20,
        customerId: 4,
        levelName: "Adult",
        startsOn: "2030-01-01",
        endsOn: "2030-12-31",
      }),
    });

    expect(
      await screen.findByRole("link", {
        name: "Adult membership, Jan 1, 2030 to Dec 31, 2030",
      })
    ).toHaveAttribute("href", "#/members/4");
  });
});
