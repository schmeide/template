import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageEditor } from "../PageEditor.tsx";
import { fireSafety, kim, renderWithBackend, row } from "./fakeBackend.tsx";

describe("PageEditor", () => {
  beforeEach(() => {
    window.location.hash = "#/handbook/new";
  });

  it("previews the body as it is typed and saves a new page", async () => {
    const calls = renderWithBackend(<PageEditor actor={kim} />, {
      "handbook.list": () => [row(1, "Leave", "Policies", 1)],
      "handbook.create": () => ({ ...fireSafety, id: 9 }),
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Title"), "Spills");
    await user.type(screen.getByLabelText("Section"), "Policies");
    await user.type(screen.getByLabelText(/^Body/), "## Mop it **now**");

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(preview.querySelector("h3")).toHaveTextContent("Mop it now");
    await user.click(screen.getByRole("button", { name: "Save page" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "handbook.create",
        input: {
          title: "Spills",
          section: "Policies",
          body: "## Mop it **now**",
          trackReads: false,
          actorId: kim.id,
        },
      })
    );
    await waitFor(() => expect(window.location.hash).toBe("#/handbook/9"));
  });

  it("edits a page from the version it opened", async () => {
    const calls = renderWithBackend(<PageEditor id={5} actor={kim} />, {
      "handbook.get": () => fireSafety,
      "handbook.list": () => [],
      "handbook.update": () => fireSafety,
    });
    const user = userEvent.setup();

    await user.clear(await screen.findByDisplayValue("Fire safety"));
    await user.type(screen.getByLabelText("Title"), "Fire");
    await user.click(screen.getByRole("button", { name: "Save page" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "handbook.update",
        input: {
          id: 5,
          version: 2,
          title: "Fire",
          section: "Policies",
          body: fireSafety.body,
          trackReads: true,
          actorId: kim.id,
        },
      })
    );
  });

  it("asks for a name before editing", () => {
    renderWithBackend(<PageEditor />, { "handbook.list": () => [] });

    expect(screen.getByText(/Choose who you are acting as/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save page" })).not.toBeInTheDocument();
  });
});
