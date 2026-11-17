import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Balances } from "../Balances.tsx";
import { balance, renderWithBackend } from "./fakeBackend.tsx";

const balances = [
  balance(1, "Bolts", { balance: 8, lowAt: 10, low: true }),
  balance(2, "Nuts", { balance: 120, lowAt: 50 }),
];

describe("Balances", () => {
  it("lists items with their balance and filters to low stock", async () => {
    renderWithBackend(<Balances />, { "stock.balances": () => balances });
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Bolts" })).toHaveAttribute("href", "#/stock/1");
    expect(within(table).getByText("120 pcs")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Low stock only"));

    expect(within(table).queryByText("Nuts")).not.toBeInTheDocument();
    expect(within(table).getByText("Bolts")).toBeInTheDocument();
  });

  it("points forward when there are no items", async () => {
    renderWithBackend(<Balances />, { "stock.balances": () => [] });

    expect(await screen.findByText(/No items yet/)).toBeInTheDocument();
  });

  it("adds an item with a floor of zero unless negative stock is allowed", async () => {
    const calls = renderWithBackend(<Balances />, {
      "stock.balances": () => balances,
      "stock.createAccount": () => balances[0],
    });
    const user = userEvent.setup();
    await screen.findByRole("table");

    await user.type(screen.getByLabelText("Name"), "Washers");
    await user.type(screen.getByLabelText("Unit"), "box");
    await user.type(screen.getByLabelText("Low at"), "5");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
    // user-event keeps its own idea of the value across a form reset, so clear it first.
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Rope");
    await user.click(screen.getByLabelText("Allow stock below zero"));
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "stock.createAccount")).toEqual([
        {
          path: "stock.createAccount",
          input: { name: "Washers", unit: "box", lowAt: 5, floor: 0 },
        },
        {
          path: "stock.createAccount",
          input: { name: "Rope", unit: "", lowAt: null, floor: null },
        },
      ])
    );
  });
});
