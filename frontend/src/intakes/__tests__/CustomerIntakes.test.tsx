import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leave, renderWithBackend } from "../../requests/__tests__/fakeBackend.tsx";
import { CustomerIntakes, intakeUrl } from "../CustomerIntakes.tsx";

const waiting = {
  token: "6f1c2c1e-5d4a-4b8e-9a51-0c4f7e2b9d10",
  typeName: "New client form",
  createdAt: new Date("2026-11-01T09:00:00Z"),
  requestId: null,
  status: null,
  submittedAt: null,
};
const filled = {
  ...waiting,
  token: "0b7f4a5e-2c1d-4e6f-8a9b-1c2d3e4f5a6b",
  requestId: 30,
  status: "submitted",
  submittedAt: new Date("2026-11-02T09:00:00Z"),
};

describe("CustomerIntakes", () => {
  it("sends a form of the chosen type for this customer", async () => {
    const calls = renderWithBackend(<CustomerIntakes id={4} />, {
      "requests.types": () => [leave],
      "intakes.list": () => [],
      "intakes.send": () => ({ ...waiting, customerId: 4, typeId: leave.id }),
    });
    const user = userEvent.setup();

    expect(await screen.findByText("No intake forms sent yet.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Send intake form" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "intakes.send")?.input).toEqual({
        customerId: 4,
        typeId: leave.id,
      })
    );
    expect(calls.find((call) => call.path === "intakes.list")?.input).toEqual({ customerId: 4 });
  });

  it("shows the link of a form not filled in and links to the request of one that is", async () => {
    renderWithBackend(<CustomerIntakes id={4} />, {
      "requests.types": () => [leave],
      "intakes.list": () => [waiting, filled],
    });

    expect(await screen.findByRole("textbox", { name: /not filled in yet/ })).toHaveValue(
      intakeUrl(waiting.token)
    );
    expect(intakeUrl(waiting.token)).toMatch(new RegExp(`#/intake/${waiting.token}$`));
    expect(screen.getByRole("link", { name: "New client form" })).toHaveAttribute(
      "href",
      "#/requests/30"
    );
  });
});
