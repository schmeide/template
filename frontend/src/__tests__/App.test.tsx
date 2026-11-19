import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, Slots, type Page } from "../App.tsx";

const page = (path: string, title: string): Page => ({
  path,
  title,
  Component: () => <h1>{title} page</h1>,
});

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("shows a single page without a menu", () => {
    render(<App pages={[page("notes", "Notes")]} />);

    expect(screen.getByRole("heading", { name: "Notes page" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("opens the first page and switches through the menu", async () => {
    render(<App pages={[page("invoices", "Invoices"), page("customers", "Customers")]} />);

    expect(screen.getByRole("heading", { name: "Invoices page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invoices" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "Customers" }));

    expect(await screen.findByRole("heading", { name: "Customers page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the views added to a slot with the id the page passes", () => {
    const host: Page = {
      path: "invoices",
      title: "Invoices",
      Component: () => <Slots name="invoice" id={7} />,
    };
    const view = ({ id }: { readonly id: number }) => <p>Linked to {id}</p>;

    render(
      <App
        pages={[host]}
        slots={[
          { slot: "invoice", Component: view },
          { slot: "quote", Component: () => <p>Elsewhere</p> },
        ]}
      />
    );

    expect(screen.getByText("Linked to 7")).toBeInTheDocument();
    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
  });

  it("renders the page's fallback only when no view fills the slot", () => {
    const host: Page = {
      path: "orders",
      title: "Orders",
      Component: () => (
        <Slots name="order-fulfillment" id={7} fallback={<button type="button">Own</button>} />
      ),
    };

    const { unmount } = render(<App pages={[host]} />);
    expect(screen.getByRole("button", { name: "Own" })).toBeInTheDocument();
    unmount();

    render(
      <App
        pages={[host]}
        slots={[{ slot: "order-fulfillment", Component: () => <p>Replaced</p> }]}
      />
    );
    expect(screen.getByText("Replaced")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Own" })).not.toBeInTheDocument();
  });

  it("opens the page named in the address", () => {
    act(() => {
      window.location.hash = "#/customers";
    });

    render(<App pages={[page("invoices", "Invoices"), page("customers", "Customers")]} />);

    expect(screen.getByRole("heading", { name: "Customers page" })).toBeInTheDocument();
  });
});
