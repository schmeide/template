import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Requests } from "../Requests.tsx";
import { kim, renderWithBackend, sam, submitted } from "./fakeBackend.tsx";

// A row as the list returns it: the request without its fields, answers and history.
const row = (overrides = {}) => {
  const request = submitted();
  const keys = ["id", "typeId", "typeName", "approverId", "submitterId", "submitterName"] as const;
  const more = ["contact", "status", "createdAt", "submittedAt"] as const;
  return {
    ...Object.fromEntries([...keys, ...more].map((key) => [key, request[key]])),
    ...overrides,
  };
};

describe("Requests", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/requests";
  });

  it("asks who you are, then shows your requests and remembers the choice", async () => {
    const calls = renderWithBackend(<Requests />, {
      "requests.people": () => [sam, kim],
      "requests.list": () => [row()],
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/Choose who you are acting as/)).toBeInTheDocument();
    await screen.findByRole("option", { name: "Sam" });
    await user.selectOptions(screen.getByLabelText("Acting as"), "Sam");

    expect(await screen.findByRole("link", { name: "Leave #30" })).toHaveAttribute(
      "href",
      "#/requests/30"
    );
    expect(calls).toContainEqual({ path: "requests.list", input: { submitterId: sam.id } });
    expect(window.localStorage.getItem("requests.actingAs")).toBe(String(sam.id));
  });

  it("leaves your own requests and other approvers' requests out of your review queue", async () => {
    window.localStorage.setItem("requests.actingAs", String(kim.id));
    window.location.hash = "#/requests/review";
    renderWithBackend(<Requests />, {
      "requests.people": () => [sam, kim],
      "requests.list": () => [
        row({ id: 31 }),
        row({ id: 32, submitterId: kim.id, submitterName: kim.name }),
        row({ id: 33, approverId: 99 }),
      ],
    });

    expect(await screen.findByRole("link", { name: "Leave #31" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Leave #32" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Leave #33" })).not.toBeInTheDocument();
  });

  it("adds a name and acts as it", async () => {
    const dana = { id: 3, name: "Dana" };
    const calls = renderWithBackend(<Requests />, {
      "requests.people": () => [sam, kim, dana],
      "requests.addPerson": () => dana,
      "requests.list": () => [],
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Name"), "Dana");
    await user.click(screen.getByRole("button", { name: "Add name" }));

    await waitFor(() => expect(screen.getByLabelText("Acting as")).toHaveValue("3"));
    expect(calls).toContainEqual({ path: "requests.addPerson", input: { name: "Dana" } });
    expect(await screen.findByText(/You have no requests yet/)).toBeInTheDocument();
  });
});
