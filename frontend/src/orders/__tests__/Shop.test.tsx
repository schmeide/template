import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Shop } from "../Shop.tsx";
import { cake, order, renderWithBackend, shopOf, tea } from "./fakeBackend.tsx";

const token = order().token;

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "#/shop";
});

describe("Shop", () => {
  it("browses, searches and filters by category on the server", async () => {
    const calls = renderWithBackend(<Shop />, {
      "orders.shop": () => shopOf([tea(), cake()]),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "Green tea" })).toHaveAttribute(
      "href",
      "#/shop/product/1"
    );
    expect(screen.getByText("$4.50")).toBeInTheDocument();
    expect(screen.getByRole("presentation")).toHaveAttribute("loading", "lazy");
    await user.type(screen.getByLabelText("Search"), "tea");
    await user.selectOptions(screen.getByLabelText("Category"), "Drinks");

    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        path: "orders.shop",
        input: { search: "tea", category: "Drinks" },
      })
    );
  });

  it("never renders an image link that is not http or https", async () => {
    renderWithBackend(<Shop />, {
      "orders.shop": () => shopOf([tea({ imageUrl: "javascript:alert(1)" })]),
    });

    await screen.findByRole("link", { name: "Green tea" });
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("adds to the cart and places an order with only ids and counts", async () => {
    const calls = renderWithBackend(<Shop />, {
      "orders.shop": () => shopOf([tea(), cake()]),
      "orders.checkout": () => ({ token }),
      "orders.publicOrder": () => order(),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add to cart Green tea" }));
    await user.click(screen.getByRole("button", { name: "Add to cart Green tea" }));
    await user.click(screen.getByRole("button", { name: "Add to cart Lemon cake" }));
    expect(screen.getByRole("status")).toHaveTextContent("Added Lemon cake to your cart.");
    await user.click(screen.getByRole("link", { name: "Cart (3)" }));

    expect(await screen.findByLabelText("Quantity of Green tea")).toHaveValue(2);
    expect(screen.getByText("$12.25")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Delivery address"), "12 Analytical Row");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() => expect(window.location.hash).toBe(`#/shop/order/${token}`));
    expect(calls.find((call) => call.path === "orders.checkout")?.input).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "",
      address: "12 Analytical Row",
      notes: "",
      website: "",
      lines: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    });
    expect(await screen.findByRole("heading", { name: "Order ORD-0012" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cart (0)" })).toBeInTheDocument();
  });

  it("marks a product no longer for sale and holds the order until it is removed", async () => {
    window.localStorage.setItem(
      "orders-cart",
      JSON.stringify([
        { productId: 1, quantity: 1 },
        { productId: 9, quantity: 1 },
      ])
    );
    window.location.hash = "#/shop/cart";
    renderWithBackend(<Shop />, { "orders.shop": () => shopOf([tea()]) });
    const user = userEvent.setup();

    expect(await screen.findByText("No longer for sale")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Remove it to place the order.");
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    const rows = screen.getAllByRole("row");
    await user.click(within(rows[2]).getByRole("button", { name: /Remove/ }));

    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
    expect(screen.queryByText("No longer for sale")).not.toBeInTheDocument();
  });

  it("says what to do when the cart is empty", async () => {
    window.location.hash = "#/shop/cart";
    renderWithBackend(<Shop />, {});

    expect(await screen.findByText(/Your cart is empty/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the products" })).toHaveAttribute(
      "href",
      "#/shop"
    );
  });

  it("shows the customer their order at its private link", async () => {
    window.location.hash = `#/shop/order/${token}`;
    renderWithBackend(<Shop />, {
      "orders.publicOrder": () => order({ status: "ready" }),
    });

    expect(await screen.findByRole("heading", { name: "Order ORD-0012" })).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("$12.25", { selector: ".order-grand-total" })).toBeInTheDocument();
  });

  it("adds a quantity from the product page", async () => {
    window.location.hash = "#/shop/product/1";
    renderWithBackend(<Shop />, {
      "orders.product": () => ({ ...tea(), currency: "USD" }),
    });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Green tea" });
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(screen.getByRole("link", { name: "Cart (3)" })).toBeInTheDocument();
  });
});
