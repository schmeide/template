import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "../Board.tsx";
import { board, renderWithBackend } from "./fakeBackend.tsx";

const column = (name: string) => screen.getByRole("region", { name });
const card = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;

const renderBoard = () =>
  renderWithBackend(<Board />, {
    "deals.board": () => board(),
    "deals.move": () => ({}),
    "deals.create": () => ({}),
  });

describe("Board", () => {
  it("shows a column per stage with its count and total value", async () => {
    renderBoard();

    const lead = await screen.findByRole("region", { name: "Lead" });
    expect(within(lead).getByText("2 deals · $15,000")).toBeInTheDocument();
    expect(
      within(lead)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Acme renewal", "Globex pilot"]);
    expect(within(lead).getByText("Acme Ltd")).toBeInTheDocument();
    expect(within(column("Won")).getByText("No deals in this stage.")).toBeInTheDocument();
  });

  it("moves a deal with buttons and announces where it landed", async () => {
    const calls = renderBoard();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Lead" });

    const moves = within(card("Acme renewal")).getByRole("group", { name: "Move Acme renewal" });
    expect(within(moves).getByRole("button", { name: "Up" })).toBeDisabled();
    expect(within(moves).queryByRole("button", { name: /^To / })).toHaveTextContent("To Qualified");

    await user.click(within(moves).getByRole("button", { name: "Down" }));
    await user.click(within(moves).getByRole("button", { name: "To Qualified" }));

    expect(calls.filter((call) => call.path === "deals.move").map((call) => call.input)).toEqual([
      { id: 10, stageId: 1, position: 1 },
      { id: 10, stageId: 2, position: 1 },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Acme renewal moved to Qualified, 2 of 2"
    );
  });

  it("moves a deal by dragging it onto a column or a card", async () => {
    const calls = renderBoard();
    await screen.findByRole("region", { name: "Lead" });
    const dataTransfer = { setData: () => undefined };

    fireEvent.dragStart(card("Globex pilot"), { dataTransfer });
    fireEvent.drop(column("Won"));
    fireEvent.dragStart(card("Globex pilot"), { dataTransfer });
    fireEvent.drop(card("Initech upgrade"));

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "deals.move").map((call) => call.input)).toEqual([
        { id: 11, stageId: 3, position: 0 },
        { id: 11, stageId: 2, position: 0 },
      ])
    );
  });

  it("adds a deal to the chosen stage", async () => {
    const calls = renderBoard();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Lead" });

    await user.type(screen.getByLabelText("Title"), "Umbrella expansion");
    await user.selectOptions(screen.getByLabelText("Stage"), "Qualified");
    await user.type(screen.getByLabelText("Value"), "8000");
    await user.click(screen.getByRole("button", { name: "Add deal" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "deals.create")?.input).toEqual({
        title: "Umbrella expansion",
        stageId: 2,
        value: 8000,
      })
    );
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
});
