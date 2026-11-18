import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingDetail } from "../BookingDetail.tsx";
import { renderWithBackend, resources, services, slot } from "./fakeBackend.tsx";

const detail = (status: "booked" | "cancelled" = "booked") => ({
  id: 7,
  resourceId: 1,
  serviceId: 5,
  customerId: 4,
  startsAt: new Date("2030-03-11T13:00:00Z"),
  endsAt: new Date("2030-03-11T13:30:00Z"),
  status,
  seat: 1,
  capacity: 1,
  createdAt: new Date("2030-01-01"),
  resource: resources()[0],
  service: services()[0],
  customer: {
    id: 4,
    name: "Ada",
    email: "ada@example.com",
    phone: "",
    address: "",
    createdAt: new Date("2030-01-01"),
  },
});

describe("BookingDetail", () => {
  it("shows the booking on its resource's clock, saves a status and moves it", async () => {
    const calls = renderWithBackend(<BookingDetail id={7} />, {
      "bookings.get": () => detail(),
      "bookings.resources": () => resources(),
      "bookings.slots": () => [slot("2030-03-11T14:00:00Z")],
      "bookings.setStatus": () => detail(),
      "bookings.move": () => detail(),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Cut for Ada" })).toBeInTheDocument();
    // The Monday after clocks go forward: 09:00 EDT is 13:00 UTC.
    expect(screen.getByText(/Monday, March 11, 2030, 9:00\sAM EDT/)).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Status"), "Confirmed");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    await user.click(await screen.findByRole("radio", { name: /10:00\sAM EDT, Sam/ }));
    await user.click(screen.getByRole("button", { name: "Move booking" }));

    await waitFor(() =>
      expect(
        calls.filter((call) => ["bookings.setStatus", "bookings.move"].includes(call.path))
      ).toEqual([
        { path: "bookings.setStatus", input: { id: 7, status: "confirmed" } },
        {
          path: "bookings.move",
          input: { id: 7, resourceId: 1, startsAt: new Date("2030-03-11T14:00:00Z") },
        },
      ])
    );
    expect(calls.find((call) => call.path === "bookings.slots")?.input).toEqual({
      serviceId: 5,
      from: "2030-03-11",
      to: "2030-03-11",
    });
  });

  it("offers no changes to a cancelled booking", async () => {
    renderWithBackend(<BookingDetail id={7} />, {
      "bookings.get": () => detail("cancelled"),
      "bookings.resources": () => resources(),
    });

    expect(
      await screen.findByText("This booking is cancelled and its time is free for others.")
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Move booking" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });
});
