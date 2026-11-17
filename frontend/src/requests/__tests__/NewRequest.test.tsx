import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewRequest } from "../NewRequest.tsx";
import { leave, renderWithBackend, sam, submitted } from "./fakeBackend.tsx";

describe("NewRequest", () => {
  it("files a request of the chosen type and submits it", async () => {
    const calls = renderWithBackend(<NewRequest actor={sam} />, {
      "requests.types": () => [leave],
      "requests.create": () => submitted({ status: "draft" }),
      "requests.transition": () => submitted(),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Leave" });
    await user.selectOptions(screen.getByLabelText("Type"), "Leave");
    await user.selectOptions(screen.getByLabelText("Kind of leave"), "Sick");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-12-21" } });
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path !== "requests.types")).toEqual([
        {
          path: "requests.create",
          input: {
            typeId: leave.id,
            actorId: sam.id,
            answers: { "Kind of leave": "Sick", "First day": "2026-12-21" },
          },
        },
        { path: "requests.transition", input: { id: 30, actorId: sam.id, to: "submitted" } },
      ])
    );
  });

  it("saves a partial draft without submitting it", async () => {
    const calls = renderWithBackend(<NewRequest actor={sam} />, {
      "requests.types": () => [leave],
      "requests.create": () => submitted({ status: "draft" }),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Leave" });
    await user.selectOptions(screen.getByLabelText("Type"), "Leave");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path !== "requests.types")).toEqual([
        { path: "requests.create", input: { typeId: leave.id, actorId: sam.id, answers: {} } },
      ])
    );
  });
});
