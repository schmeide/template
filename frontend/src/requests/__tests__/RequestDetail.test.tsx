import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestDetail } from "../RequestDetail.tsx";
import type { Detail, Person } from "../format.ts";
import { kim, leave, renderWithBackend, sam, submitted } from "./fakeBackend.tsx";

const renderAs = (actor: Person, detail: Detail) =>
  renderWithBackend(<RequestDetail id={detail.id} actor={actor} />, {
    "requests.get": () => detail,
    "requests.types": () => [leave],
    "requests.update": () => detail,
    "requests.transition": () => detail,
  });

const changes = (calls: ReturnType<typeof renderAs>) =>
  calls.filter((call) => call.path === "requests.update" || call.path === "requests.transition");

describe("RequestDetail", () => {
  it("shows the answers and history, and lets a reviewer decide with a comment", async () => {
    const calls = renderAs(kim, submitted());
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Leave #30 from Sam" })).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("Submitted by Sam");

    await user.type(screen.getByLabelText("Comment (optional)"), "Enjoy");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(changes(calls)).toEqual([
        {
          path: "requests.transition",
          input: { id: 30, actorId: kim.id, to: "approved", comment: "Enjoy" },
        },
      ])
    );
  });

  it("does not offer the submitter a decision on their own request", async () => {
    const calls = renderAs(sam, submitted());
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Leave #30 from Sam" });
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/You cannot approve your own/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Withdraw request" }));
    expect(changes(calls)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Withdraw request" }));

    await waitFor(() =>
      expect(changes(calls)).toEqual([
        { path: "requests.transition", input: { id: 30, actorId: sam.id, to: "withdrawn" } },
      ])
    );
  });

  it("lets the submitter change a returned request and submit it again", async () => {
    const calls = renderAs(sam, submitted({ status: "returned" }));
    const user = userEvent.setup();

    const note = await screen.findByLabelText(/^Note/);
    await user.type(note, "Back on the 2nd");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(changes(calls)).toEqual([
        {
          path: "requests.update",
          input: {
            id: 30,
            actorId: sam.id,
            answers: {
              "Kind of leave": "Vacation",
              "First day": "2026-12-21",
              Note: "Back on the 2nd",
            },
          },
        },
        { path: "requests.transition", input: { id: 30, actorId: sam.id, to: "submitted" } },
      ])
    );
  });

  it("tells someone who is not the approver that they cannot decide", async () => {
    renderAs(kim, submitted({ approverId: 99 }));

    expect(await screen.findByText(/Only this request type.s approver/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});
