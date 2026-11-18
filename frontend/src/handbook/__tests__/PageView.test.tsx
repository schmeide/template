import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageView } from "../PageView.tsx";
import { fireSafety, kim, renderWithBackend, sam } from "./fakeBackend.tsx";

describe("PageView", () => {
  it("renders the page as Markdown with who changed it last", async () => {
    renderWithBackend(<PageView id={5} actor={sam} />, { "handbook.get": () => fireSafety });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Fire safety" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Exits" })).toBeInTheDocument();
    expect(screen.getByText(/by Sam/)).toBeInTheDocument();
  });

  it("lists who has not read this version", async () => {
    renderWithBackend(<PageView id={5} actor={sam} />, { "handbook.get": () => fireSafety });

    const unread = await screen.findByRole("list", { name: "Not read this version" });
    expect(
      within(unread)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Kim (read an earlier version)", "Dana"]);
    expect(screen.getByText(/You have read this version/)).toBeInTheDocument();
  });

  it("confirms a read of the version shown", async () => {
    const calls = renderWithBackend(<PageView id={5} actor={kim} />, {
      "handbook.get": () => fireSafety,
      "handbook.confirmRead": () => true,
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "I have read this" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "handbook.confirmRead",
        input: { id: 5, version: 2, actorId: kim.id },
      })
    );
  });
});
