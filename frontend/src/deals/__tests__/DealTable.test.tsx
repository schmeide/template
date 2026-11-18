import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DealTable } from "../DealTable.tsx";
import { board, renderWithBackend } from "./fakeBackend.tsx";

const dealNames = () =>
  screen
    .queryAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("a")?.textContent);

describe("DealTable", () => {
  it("filters deals by stage and searches title, contact and owner", async () => {
    renderWithBackend(<DealTable />, { "deals.board": () => board() });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "Acme renewal" })).toBeInTheDocument();
    expect(dealNames()).toEqual(["Acme renewal", "Globex pilot", "Initech upgrade"]);
    expect(screen.getByRole("cell", { name: "$12,000" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stage"), "Lead");
    expect(dealNames()).toEqual(["Acme renewal", "Globex pilot"]);

    await user.type(screen.getByLabelText("Search"), "acme ltd");
    expect(dealNames()).toEqual(["Acme renewal"]);

    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "nobody");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(dealNames()).toHaveLength(3);
  });
});
