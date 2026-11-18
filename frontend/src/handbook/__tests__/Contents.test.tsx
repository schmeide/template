import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Contents } from "../Contents.tsx";
import { renderWithBackend, row } from "./fakeBackend.tsx";

const pages = [
  row(1, "Welcome", "", 1),
  row(2, "Leave", "Policies", 1),
  row(3, "Fire safety", "Policies", 2),
];

describe("Contents", () => {
  it("lists pages under their sections in order", async () => {
    renderWithBackend(<Contents />, { "handbook.list": () => pages });

    const policies = await screen.findByRole("region", { name: "Policies" });
    expect(
      within(policies)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Leave", "Fire safety"]);
    expect(screen.getByRole("link", { name: "Welcome" })).toHaveAttribute("href", "#/handbook/1");
  });

  it("moves a page up in its section", async () => {
    const calls = renderWithBackend(<Contents />, {
      "handbook.list": () => pages,
      "handbook.move": () => true,
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Move Fire safety up" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "handbook.move", input: { id: 3, direction: "up" } })
    );
    expect(screen.getByRole("button", { name: "Move Leave up" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("searches titles and bodies", async () => {
    const calls = renderWithBackend(<Contents />, {
      "handbook.list": () => pages,
      "handbook.search": () => [{ id: 3, title: "Fire safety", section: "Policies" }],
    });
    const user = userEvent.setup();

    await user.type(screen.getByRole("searchbox", { name: "Search the handbook" }), "exit");

    const results = await screen.findByRole("region", { name: "Search results" });
    expect(within(results).getByRole("link", { name: "Fire safety" })).toBeInTheDocument();
    expect(calls).toContainEqual({ path: "handbook.search", input: { query: "exit" } });
  });
});
