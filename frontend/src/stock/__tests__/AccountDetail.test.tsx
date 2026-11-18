import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDetail } from "../AccountDetail.tsx";
import { bolts, renderWithBackend } from "./fakeBackend.tsx";

const renderDetail = (handlers = {}) =>
  renderWithBackend(<AccountDetail id={1} />, {
    "stock.get": () => bolts(),
    "stock.addEntry": () => bolts().entries[0],
    "stock.reverse": () => bolts().entries[0],
    "stock.updateAccount": () => bolts(),
    ...handlers,
  });

describe("AccountDetail", () => {
  it("shows the balance and the history, marking reversals", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Bolts" })).toBeInTheDocument();
    expect(screen.getByText("8 pcs in stock")).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[2].textContent)).toEqual([
      "-5 pcs",
      "+5 pcs",
      "-4 pcs",
      "+12 pcs",
    ]);
    expect(within(rows[0]).getByText(/Reversal/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Reversed")).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rows[2]).getByRole("button", { name: /Reverse/ })).toBeInTheDocument();
  });

  it("records stock out as a negative quantity", async () => {
    const calls = renderDetail();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Bolts" });

    await user.selectOptions(screen.getByLabelText("Kind"), "Out");
    await user.type(screen.getByLabelText("Quantity"), "3");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-20" } });
    await user.type(screen.getByLabelText("Who"), "Ana");
    await user.type(screen.getByLabelText("Reference"), "Job 12");
    await user.click(screen.getByRole("button", { name: "Add entry" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "stock.addEntry",
        input: {
          accountId: 1,
          kind: "out",
          quantity: -3,
          entryDate: "2026-03-20",
          who: "Ana",
          reference: "Job 12",
          note: "",
        },
      })
    );
  });

  it("shows why an entry was refused", async () => {
    renderDetail({
      "stock.addEntry": () => {
        throw new Error("That would take the stock below its floor.");
      },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Bolts" });

    await user.selectOptions(screen.getByLabelText("Kind"), "Out");
    await user.type(screen.getByLabelText("Quantity"), "30");
    await user.click(screen.getByRole("button", { name: "Add entry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That would take the stock below its floor."
    );
  });

  it("reverses an entry after asking", async () => {
    const calls = renderDetail();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Bolts" });

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    await user.click(within(rows[3]).getByRole("button", { name: /Reverse/ }));
    const confirm = screen.getByRole("form", { name: /Reverse/ });
    await user.type(within(confirm).getByLabelText("Reason"), "Counted twice");
    await user.click(within(confirm).getByRole("button", { name: "Reverse entry" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "stock.reverse",
        input: expect.objectContaining({ entryId: 2, note: "Counted twice", who: "" }),
      })
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "History" })).toHaveFocus());
  });

  it("saves the item's settings", async () => {
    const calls = renderDetail();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Bolts" });

    await user.clear(screen.getByLabelText("Low at"));
    await user.type(screen.getByLabelText("Low at"), "20");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "stock.updateAccount",
        input: { id: 1, name: "Bolts", unit: "pcs", lowAt: 20, floor: 0 },
      })
    );
  });
});
