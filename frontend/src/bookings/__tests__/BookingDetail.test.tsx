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
  seriesId: null as string | null,
  series: [],
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

  it("lists the series, and moves or cancels this booking and the later ones", async () => {
    const series = [
      { id: 6, startsAt: "2030-03-04T14:00:00Z", status: "completed" as const },
      { id: 7, startsAt: "2030-03-11T13:00:00Z", status: "booked" as const },
      { id: 8, startsAt: "2030-03-18T13:00:00Z", status: "booked" as const },
    ].map(({ id, startsAt, status }) => ({
      id,
      status,
      startsAt: new Date(startsAt),
      endsAt: new Date(Date.parse(startsAt) + 30 * 60_000),
      timeZone: "America/New_York",
    }));
    const calls = renderWithBackend(<BookingDetail id={7} />, {
      "bookings.get": () => ({ ...detail(), seriesId: "s", series }),
      "bookings.resources": () => resources(),
      "bookings.slots": () => [slot("2030-03-11T14:00:00Z")],
      "bookings.moveSeries": () => [],
      "bookings.cancelSeries": () => [],
    });
    const user = userEvent.setup();

    const list = await screen.findByRole("list", { name: "Bookings in this series" });
    expect(list).toHaveTextContent(/Monday, March 4, 2030, 9:00\sAM EST, Completed/);
    expect(list).toHaveTextContent(/Monday, March 18, 2030, 9:00\sAM EDT, Booked/);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(/March 11/);
    await user.click(await screen.findByRole("radio", { name: /10:00\sAM EDT, Sam/ }));
    await user.click(screen.getByRole("checkbox", { name: "Move the later bookings too" }));
    await user.click(screen.getByRole("button", { name: "Move booking" }));
    await user.click(screen.getByRole("button", { name: "Cancel this and later bookings" }));
    expect(screen.getByText(/Cancel 2 bookings\? Their times become free/)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep bookings" }));
    await user.click(screen.getByRole("button", { name: "Cancel this and later bookings" }));
    await user.click(screen.getByRole("button", { name: "Cancel 2 bookings" }));

    await waitFor(() =>
      expect(
        calls.filter((call) =>
          ["bookings.move", "bookings.moveSeries", "bookings.cancelSeries"].includes(call.path)
        )
      ).toEqual([
        {
          path: "bookings.moveSeries",
          input: { id: 7, resourceId: 1, startsAt: new Date("2030-03-11T14:00:00Z") },
        },
        { path: "bookings.cancelSeries", input: { id: 7 } },
      ])
    );
  });

  it("offers only a change of customer on a cancelled booking", async () => {
    const calls = renderWithBackend(<BookingDetail id={7} />, {
      "bookings.get": () => detail("cancelled"),
      "bookings.resources": () => resources(),
      "customers.list": () => [
        detail().customer,
        { ...detail().customer, id: 9, name: "Ada Lovelace", email: "ada@club.example" },
      ],
      "bookings.changeCustomer": () => ({ ...detail("cancelled"), customerId: 9 }),
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText("This booking is cancelled and its time is free for others.")
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Move booking" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    // The booking's own customer is not offered.
    const customer = screen.getByLabelText("Customer");
    await screen.findByRole("option", { name: "Ada Lovelace, ada@club.example" });
    expect(screen.queryByRole("option", { name: "Ada, ada@example.com" })).not.toBeInTheDocument();
    await user.selectOptions(customer, "Ada Lovelace, ada@club.example");
    await user.click(screen.getByRole("button", { name: "Change customer" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Customer changed"));
    expect(calls.find((call) => call.path === "bookings.changeCustomer")?.input).toEqual({
      id: 7,
      fromCustomerId: 4,
      customerId: 9,
    });
  });
});
