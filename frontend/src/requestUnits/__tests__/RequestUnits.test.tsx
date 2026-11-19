import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { asset, renderWithBackend } from "../../assets/__tests__/fakeBackend.tsx";
import { RequestUnit, UnitRequests } from "../RequestUnits.tsx";

const flat = { id: 4, name: "Flat 2, 14 Mill Road", tag: "MR-2", archivedAt: null };

describe("RequestUnit", () => {
  it("searches the units and files the request against the one chosen", async () => {
    const calls = renderWithBackend(<RequestUnit id={30} />, {
      "requestUnits.forRequest": () => null,
      "assets.list": () => ({ rows: [asset(4, flat.name, { tag: "MR-2" })], total: 1 }),
      "requestUnits.set": () => flat,
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Find a unit"), "Mill");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: `Choose ${flat.name}` }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "requestUnits.set",
        input: { requestId: 30, recordId: 4 },
      })
    );
    expect(calls.find((call) => call.path === "assets.list")?.input).toMatchObject({
      search: "Mill",
    });
  });

  it("shows the unit chosen and clears it", async () => {
    const calls = renderWithBackend(<RequestUnit id={30} />, {
      "requestUnits.forRequest": () => flat,
      "requestUnits.set": () => null,
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: flat.name })).toHaveAttribute(
      "href",
      "#/assets/4"
    );
    await user.click(screen.getByRole("button", { name: "Clear unit" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "requestUnits.set",
        input: { requestId: 30, recordId: null },
      })
    );
  });
});

describe("UnitRequests", () => {
  it("lists a unit's requests with their status, each linking to the request", async () => {
    renderWithBackend(<UnitRequests id={4} />, {
      "requestUnits.forUnit": () => [
        { id: 31, typeName: "Maintenance request", status: "approved", submittedAt: new Date() },
        { id: 12, typeName: "Inspection", status: "draft", submittedAt: null },
      ],
    });

    expect(await screen.findByRole("link", { name: "Maintenance request #31" })).toHaveAttribute(
      "href",
      "#/requests/31"
    );
    expect(screen.getByRole("row", { name: /Inspection #12/ })).toHaveTextContent("Not submitted");
  });

  it("says how to fill an empty history", async () => {
    renderWithBackend(<UnitRequests id={4} />, { "requestUnits.forUnit": () => [] });

    expect(await screen.findByText(/No requests yet/)).toBeInTheDocument();
  });
});
