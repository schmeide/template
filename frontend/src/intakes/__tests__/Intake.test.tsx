import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leave, renderWithBackend } from "../../requests/__tests__/fakeBackend.tsx";
import { Intake } from "../Intake.tsx";

const token = "6f1c2c1e-5d4a-4b8e-9a51-0c4f7e2b9d10";

describe("Intake", () => {
  beforeEach(() => {
    window.location.hash = `#/intake/${token}`;
  });

  it("sends the answers with the honeypot left empty and no contact", async () => {
    const calls = renderWithBackend(<Intake />, {
      "intakes.form": () => ({ name: leave.name, fields: leave.fields }),
      "intakes.submit": () => ({ received: true }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Leave" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Kind of leave"), "Vacation");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-12-21" } });
    await user.click(screen.getByRole("button", { name: "Send form" }));

    expect(
      await screen.findByRole("heading", { name: "Thanks, your form is in" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((call) => call.path === "intakes.submit")).toEqual([
        {
          path: "intakes.submit",
          input: {
            token,
            website: "",
            answers: { "Kind of leave": "Vacation", "First day": "2026-12-21" },
          },
        },
      ])
    );
  });

  it("says when the link is closed", async () => {
    renderWithBackend(<Intake />, {});

    expect(await screen.findByRole("heading", { name: "This link is closed" })).toBeInTheDocument();
  });

  it("says where links come from without a token", () => {
    window.location.hash = "#/intake";
    renderWithBackend(<Intake />, {});

    expect(screen.getByRole("heading", { name: "Intake forms" })).toBeInTheDocument();
  });
});
