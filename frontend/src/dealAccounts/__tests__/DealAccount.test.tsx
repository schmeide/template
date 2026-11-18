import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend } from "../../deals/__tests__/fakeBackend.tsx";
import { AccountDeal, DealAccount } from "../DealAccount.tsx";

const deal = (outcome: "won" | null) => ({
  id: 10,
  title: "Acme rebrand",
  stage: { id: 5, name: outcome === "won" ? "Won" : "Lead", position: 0, outcome },
});
const link = {
  deal: { id: 10, title: "Acme rebrand" },
  account: { id: 7, name: "Acme rebrand" },
};

describe("DealAccount", () => {
  beforeEach(() => {
    window.location.hash = "#/deals/10";
  });

  it("opens a project for a won deal and goes to it", async () => {
    const calls = renderWithBackend(<DealAccount id={10} />, {
      "deals.get": () => deal("won"),
      "dealAccounts.byDeal": () => null,
      "dealAccounts.open": () => ({ id: 7, name: "Acme rebrand" }),
    });

    await userEvent.click(await screen.findByRole("button", { name: "Open project" }));

    await waitFor(() => expect(window.location.hash).toBe("#/stock/7"));
    expect(calls.find((call) => call.path === "dealAccounts.open")?.input).toEqual({
      itemId: 10,
    });
  });

  it("offers nothing before the deal is won", async () => {
    const calls = renderWithBackend(<DealAccount id={10} />, {
      "deals.get": () => deal(null),
      "dealAccounts.byDeal": () => null,
    });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("dealAccounts.byDeal"));
    expect(screen.queryByRole("button", { name: "Open project" })).not.toBeInTheDocument();
  });

  it("links to the project once it exists, even after the deal leaves the won stage", async () => {
    renderWithBackend(<DealAccount id={10} />, {
      "deals.get": () => deal(null),
      "dealAccounts.byDeal": () => link,
    });

    expect(await screen.findByRole("link", { name: "Acme rebrand" })).toHaveAttribute(
      "href",
      "#/stock/7"
    );
    expect(screen.queryByRole("button", { name: "Open project" })).not.toBeInTheDocument();
  });
});

describe("AccountDeal", () => {
  it("links an account to the deal it was opened for", async () => {
    renderWithBackend(<AccountDeal id={7} />, { "dealAccounts.byAccount": () => link });

    expect(await screen.findByRole("link", { name: "Acme rebrand" })).toHaveAttribute(
      "href",
      "#/deals/10"
    );
  });
});
