import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend, sam, submitted } from "../../requests/__tests__/fakeBackend.tsx";
import { AccountLeave, RequestLeave } from "../Leave.tsx";

const balance = (id: number, name: string) => ({
  id,
  name,
  unit: "days",
  floor: null,
  lowAt: null,
  createdAt: new Date("2026-01-01T09:00:00Z"),
  balance: 20,
  low: false,
});
const balances = [balance(5, "Sam, vacation"), balance(6, "Sam, sick")];
const vacation = { personId: sam.id, kind: "Vacation", accountId: 5 };

describe("RequestLeave", () => {
  it("takes an approved request off the balance its kind draws on", async () => {
    const calls = renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () => submitted({ status: "approved" }),
      "leave.forRequest": () => null,
      "leave.accounts": () => [vacation],
      "stock.balances": () => balances,
      "leave.post": () => ({ entry: { id: 1 } }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Take off balance" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "leave.post", input: { requestId: 30 } })
    );
  });

  it("offers nothing to take off before the request is approved", async () => {
    renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () => submitted(),
      "leave.forRequest": () => null,
      "leave.accounts": () => [vacation],
      "stock.balances": () => balances,
    });

    expect(await screen.findByRole("heading", { name: "Leave balance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take off balance" })).not.toBeInTheDocument();
  });

  it("says when the kind draws on no balance, and sets one", async () => {
    const calls = renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () => submitted({ status: "approved" }),
      "leave.forRequest": () => null,
      "leave.accounts": () => [],
      "stock.balances": () => balances,
      "leave.setAccount": () => vacation,
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/Sam’s Vacation leave draws on no balance/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take off balance" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Choose Sam’s leave balances"));
    const form = screen.getByRole("form", { name: "Sam’s leave balances" });
    await within(within(form).getByLabelText("Vacation")).findByRole("option", {
      name: "Sam, vacation",
    });
    await user.selectOptions(within(form).getByLabelText("Vacation"), "Sam, vacation");
    await user.click(within(form).getByRole("button", { name: "Save balances" }));

    expect(await within(form).findByRole("status")).toHaveTextContent("Saved");
    expect(calls.filter((call) => call.path === "leave.setAccount")).toEqual([
      { path: "leave.setAccount", input: { personId: sam.id, kind: "Vacation", accountId: 5 } },
    ]);
  });

  it("shows the refusal when the request cannot come off", async () => {
    renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () => submitted({ status: "approved" }),
      "leave.forRequest": () => null,
      "leave.accounts": () => [vacation],
      "stock.balances": () => balances,
      "leave.post": () => {
        throw new Error("Days must be a whole number above zero to come off a balance.");
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Take off balance" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Days must be a whole number");
  });

  it("links to the balance once taken off", async () => {
    renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () => submitted({ status: "approved" }),
      "leave.forRequest": () => ({
        entryId: 1,
        accountId: 5,
        accountName: "Sam, vacation",
        quantity: -3,
        entryDate: "2026-12-21",
      }),
    });

    expect(await screen.findByRole("link", { name: "Sam, vacation" })).toHaveAttribute(
      "href",
      "#/stock/5"
    );
    expect(screen.queryByRole("button", { name: "Take off balance" })).not.toBeInTheDocument();
  });

  it("shows nothing on a request type with no kind of leave", async () => {
    const calls = renderWithBackend(<RequestLeave id={30} />, {
      "requests.get": () =>
        submitted({ fields: [{ label: "Amount", kind: "number", required: true }] }),
      "leave.forRequest": () => null,
    });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("leave.forRequest"));
    expect(screen.queryByRole("heading", { name: "Leave balance" })).not.toBeInTheDocument();
  });
});

describe("AccountLeave", () => {
  it("names whose leave the balance holds and links each request taken off it", async () => {
    renderWithBackend(<AccountLeave id={5} />, {
      "leave.forAccount": () => ({
        drawnBy: [{ personName: "Sam", kind: "Vacation" }],
        postings: [{ requestId: 30, entryId: 1, quantity: -3, entryDate: "2026-12-21" }],
      }),
    });

    expect(
      await screen.findByText("Sam’s Vacation leave comes off this balance.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request #30" })).toHaveAttribute(
      "href",
      "#/requests/30"
    );
  });

  it("shows nothing on a balance that is not leave", async () => {
    const calls = renderWithBackend(<AccountLeave id={5} />, {
      "leave.forAccount": () => ({ drawnBy: [], postings: [] }),
    });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("leave.forAccount"));
    expect(screen.queryByRole("heading", { name: "Leave" })).not.toBeInTheDocument();
  });
});
