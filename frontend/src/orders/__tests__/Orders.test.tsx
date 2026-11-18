import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Orders } from "../Orders.tsx";
import { order, renderWithBackend, staffProduct } from "./fakeBackend.tsx";

describe("Orders", () => {
  it("lists orders and filters them by status", async () => {
    window.location.hash = "#/orders";
    const calls = renderWithBackend(<Orders />, { "orders.list": () => [order()] });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "ORD-0012" })).toHaveAttribute(
      "href",
      "#/orders/7"
    );
    expect(screen.getByRole("cell", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "$12.25" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Status"), "Ready");

    await waitFor(() =>
      expect(calls.at(-1)).toEqual({ path: "orders.list", input: { status: "ready" } })
    );
  });

  it("shows an order and offers only the steps allowed from its status", async () => {
    window.location.hash = "#/orders/7";
    const calls = renderWithBackend(<Orders />, {
      "orders.get": () => order({ status: "accepted" }),
      "orders.setStatus": () => ({ ...order(), status: "ready" }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Order ORD-0012" })).toBeInTheDocument();
    expect(screen.getByText("12 Analytical Row")).toBeInTheDocument();
    expect(screen.getByText("Leave at the door")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark ready" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "orders.setStatus", input: { id: 7, to: "ready" } })
    );
  });

  it("asks before cancelling an order", async () => {
    window.location.hash = "#/orders/7";
    const calls = renderWithBackend(<Orders />, {
      "orders.get": () => order(),
      "orders.setStatus": () => ({ ...order(), status: "cancelled" }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep order" }));
    expect(calls.some((call) => call.path === "orders.setStatus")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.click(screen.getByRole("button", { name: "Cancel ORD-0012" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "orders.setStatus", input: { id: 7, to: "cancelled" } })
    );
  });

  it("says why a status change was refused", async () => {
    window.location.hash = "#/orders/7";
    renderWithBackend(<Orders />, {
      "orders.get": () => order(),
      "orders.setStatus": () => {
        throw new Error("The order cannot move to that status from where it is.");
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to change the status: The order cannot move to that status from where it is."
    );
  });

  it("adds a product with its price in minor units and tax in basis points", async () => {
    window.location.hash = "#/orders/products";
    const calls = renderWithBackend(<Orders />, {
      "orders.products": () => ({ currency: "USD", products: [staffProduct()] }),
      "orders.createProduct": () => staffProduct({ id: 2 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "Green tea" })).toHaveAttribute(
      "href",
      "#/orders/products/1"
    );
    await user.type(screen.getByLabelText("Name"), "Lemon cake");
    await user.type(screen.getByLabelText("Price"), "3.25");
    await user.type(screen.getByLabelText("Tax rate (%)"), "20");
    await user.type(screen.getByLabelText("Category"), "Bakery");
    await user.click(screen.getByRole("button", { name: "Add product" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "orders.createProduct",
        input: {
          name: "Lemon cake",
          description: "",
          price: 325,
          taxRate: 2000,
          category: "Bakery",
          imageUrl: "",
          active: true,
        },
      })
    );
  });

  it("refuses a price it cannot read before sending it", async () => {
    window.location.hash = "#/orders/products";
    const calls = renderWithBackend(<Orders />, {
      "orders.products": () => ({ currency: "USD", products: [] }),
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Name"), "Cake");
    await user.type(screen.getByLabelText("Price"), "3.255");
    await user.click(screen.getByRole("button", { name: "Add product" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the price as a number with at most 2 decimals, like 4.50."
    );
    expect(calls.some((call) => call.path === "orders.createProduct")).toBe(false);
  });

  it("edits a product and takes it off sale", async () => {
    window.location.hash = "#/orders/products/1";
    const calls = renderWithBackend(<Orders />, {
      "orders.products": () => ({ currency: "USD", products: [staffProduct()] }),
      "orders.updateProduct": () => staffProduct({ active: false }),
    });
    const user = userEvent.setup();

    expect(await screen.findByLabelText("Price")).toHaveValue("4.5");
    await user.click(screen.getByLabelText("For sale"));
    await user.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "orders.updateProduct",
        input: expect.objectContaining({ id: 1, price: 450, active: false }),
      })
    );
    await waitFor(() => expect(window.location.hash).toBe("#/orders/products"));
  });
});
