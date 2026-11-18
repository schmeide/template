import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { order, renderWithBackend } from "../../orders/__tests__/fakeBackend.tsx";
import { OrderFulfillment, ProductStock } from "../OrderStock.tsx";

const flour = {
  id: 3,
  name: "Flour",
  unit: "g",
  floor: 0,
  lowAt: null,
  balance: 5000,
  low: false,
  createdAt: new Date("2026-03-01"),
};

describe("ProductStock", () => {
  it("lists the stock items a product takes and removes one", async () => {
    const calls = renderWithBackend(<ProductStock id={1} />, {
      "orderStock.items": () => [{ accountId: 3, name: "Flour", unit: "g", quantity: 200 }],
      "stock.balances": () => [flour],
      "orderStock.removeItem": () => undefined,
    });

    expect(await screen.findByRole("cell", { name: "200 g" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Flour" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "orderStock.removeItem",
        input: { productId: 1, accountId: 3 },
      })
    );
  });

  it("adds a stock item with how much one sold takes", async () => {
    const calls = renderWithBackend(<ProductStock id={1} />, {
      "orderStock.items": () => [],
      "stock.balances": () => [flour],
      "orderStock.setItem": () => undefined,
    });

    expect(await screen.findByText(/takes nothing from stock/i)).toBeInTheDocument();
    await screen.findByRole("option", { name: "Flour (g)" });
    await userEvent.selectOptions(screen.getByLabelText("Stock item"), "Flour (g)");
    await userEvent.type(screen.getByLabelText("Per one sold"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save stock item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/whole number above zero/);

    await userEvent.clear(screen.getByLabelText("Per one sold"));
    await userEvent.type(screen.getByLabelText("Per one sold"), "250");
    await userEvent.click(screen.getByRole("button", { name: "Save stock item" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "orderStock.setItem",
        input: { productId: 1, accountId: 3, quantity: 250 },
      })
    );
  });

  it("points to the Stock page when there are no stock items", async () => {
    renderWithBackend(<ProductStock id={1} />, {
      "orderStock.items": () => [],
      "stock.balances": () => [],
    });

    expect(await screen.findByRole("link", { name: "Stock page" })).toHaveAttribute(
      "href",
      "#/stock"
    );
  });
});

describe("OrderFulfillment", () => {
  it("fulfills the order with who did it", async () => {
    const calls = renderWithBackend(<OrderFulfillment id={7} />, {
      "orderStock.fulfill": () => ({ ...order(), status: "fulfilled" }),
      "orders.get": () => order({ status: "fulfilled" }),
    });

    await userEvent.type(screen.getByLabelText("Fulfilled by"), "Grace");
    await userEvent.click(screen.getByRole("button", { name: "Mark fulfilled" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "orderStock.fulfill",
        input: { orderId: 7, who: "Grace" },
      })
    );
  });

  it("shows the refusal when stock cannot cover the order", async () => {
    renderWithBackend(<OrderFulfillment id={7} />, {
      "orderStock.fulfill": () => {
        throw new Error("Not enough Flour in stock.");
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Mark fulfilled" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not enough Flour in stock.");
  });
});
