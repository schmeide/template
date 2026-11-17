import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DealDetail } from "../DealDetail.tsx";
import { board, renderWithBackend } from "./fakeBackend.tsx";

const acme = {
  id: 4,
  name: "Acme Ltd",
  email: "",
  phone: "",
  address: "",
  createdAt: new Date("2026-01-01"),
};

const detail = {
  id: 10,
  title: "Acme renewal",
  stageId: 1,
  position: 0,
  owner: "Sam",
  value: 12_000,
  dueDate: "2026-12-01",
  customerId: 4,
  createdAt: new Date("2026-03-01"),
  stage: { id: 1, name: "Lead", position: 0, outcome: null },
  customer: acme,
  activity: [
    {
      id: 2,
      itemId: 10,
      kind: "stage" as const,
      text: "Moved from Lead to Qualified",
      createdAt: new Date("2026-03-03T10:00:00Z"),
    },
    {
      id: 1,
      itemId: 10,
      kind: "note" as const,
      text: "Called about renewal",
      createdAt: new Date("2026-03-02T10:00:00Z"),
    },
  ],
};

const renderDetail = () =>
  renderWithBackend(<DealDetail id={10} />, {
    "deals.get": () => detail,
    "deals.board": () => board(),
    "customers.list": () => [acme],
    "deals.update": () => detail,
    "deals.move": () => detail,
    "deals.addNote": () => detail.activity[1],
  });

describe("DealDetail", () => {
  it("shows the deal and its activity timeline, newest first", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Acme renewal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Value")).toHaveValue(12_000);
    await waitFor(() => expect(screen.getByLabelText("Contact")).toHaveValue("4"));
    expect(
      screen.getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)
    ).toEqual(["Moved from Lead to Qualified", "Called about renewal"]);
  });

  it("saves fields, moves the deal and adds a note", async () => {
    const calls = renderDetail();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Acme renewal" });
    await waitFor(() => expect(screen.getByLabelText("Contact")).toHaveValue("4"));

    await user.clear(screen.getByLabelText("Value"));
    await user.selectOptions(screen.getByLabelText("Contact"), "None");
    await user.click(screen.getByRole("button", { name: "Save deal" }));
    await user.selectOptions(screen.getByLabelText("Stage"), "Won");
    await user.click(screen.getByRole("button", { name: "Move" }));
    await user.type(screen.getByLabelText("Note"), "Sent the contract");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() =>
      expect(
        calls.filter((call) => call.path !== "deals.get" && !call.path.endsWith("list"))
      ).toEqual(
        expect.arrayContaining([
          {
            path: "deals.update",
            input: {
              id: 10,
              title: "Acme renewal",
              owner: "Sam",
              value: null,
              dueDate: "2026-12-01",
              customerId: null,
            },
          },
          { path: "deals.move", input: { id: 10, stageId: 3, position: 0 } },
          { path: "deals.addNote", input: { itemId: 10, text: "Sent the contract" } },
        ])
      )
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toHaveValue("");
  });
});
