import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Members } from "../Members.tsx";
import { adult, customer, period, renderWithBackend } from "./fakeBackend.tsx";

const bea = { ...customer, id: 5, name: "Bea", email: "" };
const members = () => [
  {
    customerId: 4,
    name: "Ada",
    email: "ada@example.com",
    levelName: "Adult",
    latestPeriodId: 20,
    endsOn: "2030-12-31",
    status: "due" as const,
  },
  {
    customerId: 6,
    name: "Cy",
    email: "",
    levelName: "Life",
    latestPeriodId: 21,
    endsOn: null,
    status: "current" as const,
  },
];

describe("Members", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("lists members by status and joins a customer who is not one", async () => {
    window.location.hash = "#/members";
    const calls = renderWithBackend(<Members />, {
      "membership.members": () => members(),
      "membership.levels": () => [adult],
      "customers.list": () => [customer, bea],
      "membership.addPeriod": () => ({ ...period, customerId: 5 }),
    });
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    expect(table).toHaveTextContent(/Ada.*Adult.*Due for renewal.*Dec 31, 2030/);
    expect(table).toHaveTextContent(/Cy.*Life.*Current.*Never/);
    await user.selectOptions(screen.getByLabelText("Status"), "Lapsed");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/No members are lapsed/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show all members" }));
    expect(screen.getByRole("table")).toBeVisible();

    // Only customers who are not members are offered.
    const picker = screen.getByLabelText("Customer");
    expect(screen.queryByRole("option", { name: "Ada, ada@example.com" })).not.toBeInTheDocument();
    await user.selectOptions(picker, "Bea");
    await user.selectOptions(screen.getByLabelText("Level"), "1");
    await user.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "membership.addPeriod")?.input).toEqual({
        customerId: 5,
        levelId: 1,
        latestPeriodId: null,
      })
    );
  });

  it("adds a level for life and refuses a fee that is not an amount", async () => {
    window.location.hash = "#/members";
    const calls = renderWithBackend(<Members />, {
      "membership.members": () => [],
      "membership.levels": () => [adult],
      "customers.list": () => [],
      "membership.createLevel": () => ({ ...adult, id: 2, name: "Life", months: null }),
    });
    const user = userEvent.setup();

    const form = within(await screen.findByRole("group", { name: "Add a level" }));
    await user.type(form.getByLabelText("Name"), "Life");
    await user.type(form.getByLabelText(/Fee/), "ten");
    await user.click(screen.getByRole("button", { name: "Add level" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter the fee as an amount/);

    await user.clear(form.getByLabelText(/Fee/));
    await user.type(form.getByLabelText(/Fee/), "250");
    await user.click(screen.getByRole("button", { name: "Add level" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "membership.createLevel")?.input).toEqual({
        name: "Life",
        fee: 25000,
        months: null,
      })
    );
  });

  it("shows a member's periods and renews from the latest one", async () => {
    window.location.hash = "#/members/4";
    const calls = renderWithBackend(<Members />, {
      "membership.member": () => ({ customer, status: "due", periods: [period] }),
      "membership.levels": () => [adult],
      "membership.addPeriod": () => ({ ...period, id: 21 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.getByText(/Due for renewal, Adult, until Dec 31, 2030/)).toBeVisible();
    expect(screen.getByRole("table", { name: "Periods" })).toHaveTextContent(/\$50\.00/);
    await waitFor(() => expect(screen.getByLabelText("Level")).toHaveValue("1"));
    await user.click(screen.getByRole("button", { name: "Renew" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "membership.addPeriod")?.input).toEqual({
        customerId: 4,
        levelId: 1,
        latestPeriodId: 20,
      })
    );
    expect(await screen.findByText("Renewed")).toBeVisible();
  });
});
