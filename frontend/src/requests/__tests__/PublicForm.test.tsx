import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicForm } from "../PublicForm.tsx";
import { leave, renderWithBackend } from "./fakeBackend.tsx";

const token = "6f1c2c1e-5d4a-4b8e-9a51-0c4f7e2b9d10";

describe("PublicForm", () => {
  it("sends the answers and contact with the honeypot left empty", async () => {
    const calls = renderWithBackend(<PublicForm token={token} />, {
      "requests.publicForm": () => ({ name: leave.name, fields: leave.fields }),
      "requests.submitPublic": () => ({ received: true }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Leave" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Kind of leave"), "Vacation");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-12-21" } });
    await user.type(screen.getByLabelText("Your name and email or phone"), "Pat, pat@example.com");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(
      await screen.findByRole("heading", { name: "Thanks, your request is in" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((call) => call.path === "requests.submitPublic")).toEqual([
        {
          path: "requests.submitPublic",
          input: {
            token,
            contact: "Pat, pat@example.com",
            website: "",
            answers: { "Kind of leave": "Vacation", "First day": "2026-12-21" },
          },
        },
      ])
    );
  });

  it("says when the link is closed", async () => {
    renderWithBackend(<PublicForm token={token} />, {});

    expect(await screen.findByRole("heading", { name: "This form is closed" })).toBeInTheDocument();
  });
});
