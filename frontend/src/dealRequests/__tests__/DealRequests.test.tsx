import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { kim, leave, renderWithBackend, sam } from "../../requests/__tests__/fakeBackend.tsx";
import { DealRequests, RequestDealLink } from "../DealRequests.tsx";

const listed = [
  { id: 31, typeName: "Punch list", status: "draft", submittedAt: null },
  {
    id: 30,
    typeName: "Site inspection",
    status: "rejected",
    submittedAt: new Date("2026-11-01T09:05:00Z"),
  },
];

describe("DealRequests", () => {
  beforeEach(() => {
    window.location.hash = "#/deals/10";
    window.localStorage.clear();
  });

  it("lists the deal's checklists with their status, each linking to its request", async () => {
    renderWithBackend(<DealRequests id={10} />, {
      "dealRequests.list": () => listed,
      "requests.types": () => [leave],
      "people.list": () => [sam, kim],
    });

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Punch list #31" })).toHaveAttribute(
      "href",
      "#/requests/31"
    );
    expect(within(table).getByText("Not yet")).toBeInTheDocument();
    expect(within(table).getByText("Rejected")).toBeInTheDocument();
  });

  it("starts a draft of the type chosen, as the person chosen, and opens it", async () => {
    const calls = renderWithBackend(<DealRequests id={10} />, {
      "dealRequests.list": () => [],
      "requests.types": () => [leave],
      "people.list": () => [sam, kim],
      "dealRequests.create": () => ({ id: 32 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByText("No checklists for this deal yet.")).toBeInTheDocument();
    await user.click(screen.getByText("New checklist"));
    await screen.findByRole("option", { name: "Leave" });
    await user.selectOptions(screen.getByLabelText("Type"), "Leave");
    await user.selectOptions(await screen.findByLabelText("Acting as"), "Kim");
    await user.click(screen.getByRole("button", { name: "Start checklist" }));

    await waitFor(() => expect(window.location.hash).toBe("#/requests/32"));
    expect(calls.find((call) => call.path === "dealRequests.create")?.input).toEqual({
      itemId: 10,
      typeId: leave.id,
      actorId: kim.id,
    });
    expect(window.localStorage.getItem("people.actingAs")).toBe(String(kim.id));
  });

  it("asks for a name first when nobody has been added", async () => {
    renderWithBackend(<DealRequests id={10} />, {
      "dealRequests.list": () => [],
      "requests.types": () => [leave],
      "people.list": () => [],
    });

    expect(await screen.findByRole("link", { name: "Requests page" })).toHaveAttribute(
      "href",
      "#/requests"
    );
  });
});

describe("RequestDealLink", () => {
  it("links a request to the deal it was filed for", async () => {
    renderWithBackend(<RequestDealLink id={30} />, {
      "dealRequests.deal": () => ({ id: 10, title: "Loft conversion" }),
    });

    expect(await screen.findByRole("link", { name: "Loft conversion" })).toHaveAttribute(
      "href",
      "#/deals/10"
    );
  });
});
