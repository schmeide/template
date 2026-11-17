import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "../Calendar.tsx";
import type { CalendarBooking } from "../format.ts";
import { ny, renderWithBackend, resources } from "./fakeBackend.tsx";

const booking = (id: number, startsAt: string, overrides: Partial<CalendarBooking> = {}) => ({
  id,
  startsAt: new Date(startsAt),
  endsAt: new Date(Date.parse(startsAt) + 30 * 60_000),
  status: "booked" as const,
  resourceId: 1,
  resourceName: "Sam",
  timeZone: ny,
  serviceId: 5,
  serviceName: "Cut",
  customerName: "Ada",
  date: "2030-01-14",
  ...overrides,
});

describe("Calendar", () => {
  it("lists a day's bookings on the resource's clock and switches to the week", async () => {
    const calls = renderWithBackend(<Calendar />, {
      "bookings.resources": () => resources(),
      "bookings.list": () => [
        // 23:00 Monday in New York is already Tuesday in UTC.
        booking(1, "2030-01-15T04:00:00Z"),
        booking(2, "2030-01-14T15:00:00Z", { status: "cancelled", customerName: "Bo" }),
        booking(3, "2030-01-16T15:00:00Z", { date: "2030-01-16", customerName: "Cy" }),
      ],
    });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-01-14" } });
    const monday = await screen.findByRole("region", { name: "Monday, January 14, 2030" });

    expect(
      await within(monday).findByRole("link", { name: /11:00\sPM EST.*Cut for Ada/ })
    ).toHaveAttribute("href", "#/bookings/1");
    expect(within(monday).getByText("Sam, Cancelled")).toBeVisible();
    expect(screen.queryByText(/Cut for Cy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Week" }));

    expect(await screen.findByRole("link", { name: /Cut for Cy/ })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(7);
    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        path: "bookings.list",
        input: { from: "2030-01-14", to: "2030-01-20" },
      })
    );
    await user.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        path: "bookings.list",
        input: { from: "2030-01-21", to: "2030-01-27" },
      })
    );
  });
});
