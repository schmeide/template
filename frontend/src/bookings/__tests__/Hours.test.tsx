import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hours } from "../Hours.tsx";
import { renderWithBackend, resources } from "./fakeBackend.tsx";

const availability = () => ({
  rules: [{ id: 3, resourceId: 1, weekday: 1, startTime: "09:00:00", endTime: "17:00:00" }],
  exceptions: [{ id: 4, resourceId: 1, date: "2030-12-25", startTime: null, endTime: null }],
});

describe("Hours", () => {
  it("adds and removes weekly hours and exceptions", async () => {
    const calls = renderWithBackend(<Hours />, {
      "bookings.resources": () => resources(),
      "bookings.availability": () => availability(),
      "bookings.addRule": () => ({}),
      "bookings.deleteRule": () => ({}),
      "bookings.addException": () => ({}),
      "bookings.deleteException": () => ({}),
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText("Times are in America/New_York.", { exact: false })
    ).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Remove Monday 09:00 to 17:00" }));
    await user.click(
      screen.getByRole("button", { name: "Remove Wednesday, December 25, 2030: Closed" })
    );
    const weekly = screen.getByRole("form", { name: "Add weekly hours" });
    await user.selectOptions(within(weekly).getByLabelText("Day"), "Saturday");
    await user.clear(within(weekly).getByLabelText("Until"));
    await user.type(within(weekly).getByLabelText("Until"), "12:00");
    await user.click(within(weekly).getByRole("button", { name: "Add hours" }));
    const exception = screen.getByRole("form", { name: "Add an exception" });
    await user.type(within(exception).getByLabelText("Date"), "2030-12-24");
    await user.type(within(exception).getByLabelText("From"), "10:00");
    await user.type(within(exception).getByLabelText("Until"), "12:00");
    await user.click(within(exception).getByRole("button", { name: "Add exception" }));

    await waitFor(() =>
      expect(
        calls.filter((call) => !["bookings.resources", "bookings.availability"].includes(call.path))
      ).toEqual([
        { path: "bookings.deleteRule", input: { id: 3 } },
        { path: "bookings.deleteException", input: { id: 4 } },
        {
          path: "bookings.addRule",
          input: { resourceId: 1, weekday: 6, startTime: "09:00", endTime: "12:00" },
        },
        {
          path: "bookings.addException",
          input: { resourceId: 1, date: "2030-12-24", startTime: "10:00", endTime: "12:00" },
        },
      ])
    );
  });
});
