import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StageSettings } from "../StageSettings.tsx";
import { board, renderWithBackend } from "./fakeBackend.tsx";

describe("StageSettings", () => {
  it("renames, reorders and adds stages", async () => {
    const calls = renderWithBackend(<StageSettings />, {
      "deals.board": () => board(),
      "deals.updateStage": () => ({}),
      "deals.moveStage": () => ({}),
      "deals.addStage": () => ({}),
    });
    const user = userEvent.setup();

    const qualified = await screen.findByRole("form", { name: "Qualified" });
    expect(
      within(screen.getByRole("form", { name: "Lead" })).getByRole("button", { name: "Up" })
    ).toBeDisabled();
    expect(
      within(screen.getByRole("form", { name: "Won" })).getByLabelText("Closes as")
    ).toHaveValue("won");

    await user.clear(within(qualified).getByLabelText("Name"));
    await user.type(within(qualified).getByLabelText("Name"), "Demo");
    await user.click(within(qualified).getByRole("button", { name: "Save" }));
    await user.click(within(qualified).getByRole("button", { name: "Up" }));
    const adding = screen.getByRole("form", { name: "Add a stage" });
    await user.type(within(adding).getByLabelText("Name"), "Lost");
    await user.selectOptions(within(adding).getByLabelText("Closes as"), "Lost");
    await user.click(within(adding).getByRole("button", { name: "Add stage" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path !== "deals.board")).toEqual([
        { path: "deals.updateStage", input: { id: 2, name: "Demo", outcome: null } },
        { path: "deals.moveStage", input: { id: 2, position: 0 } },
        { path: "deals.addStage", input: { name: "Lost", outcome: "lost" } },
      ])
    );
  });
});
