import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithBackend,
  resources,
  services,
  slot,
} from "../../bookings/__tests__/fakeBackend.tsx";
import { BookingDeal, DealVisits } from "../Visits.tsx";

const deal = (customerId: number | null) => ({ id: 3, title: "Boiler service", customerId });
const visit = (status: "booked" | "cancelled") => ({
  id: 7,
  startsAt: new Date("2030-03-11T13:00:00Z"),
  endsAt: new Date("2030-03-11T13:30:00Z"),
  status,
  resourceId: 1,
  resourceName: "Sam",
  timeZone: "America/New_York",
  serviceName: "Cut",
});

describe("DealVisits", () => {
  it("books a visit for the deal in a free slot", async () => {
    const calls = renderWithBackend(<DealVisits id={3} />, {
      "deals.get": () => deal(4),
      "visits.list": () => [],
      "bookings.services": () => services(),
      "bookings.resources": () => resources(),
      "bookings.slots": () => [slot("2030-03-11T14:00:00Z")],
      "visits.book": () => ({ id: 8 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByText("No visits booked for this deal yet.")).toBeVisible();
    await user.click(screen.getByText("Book a visit"));
    await user.selectOptions(screen.getByLabelText("Service"), "Cut, 30 minutes");
    await user.click(await screen.findByRole("radio", { name: /10:00\sAM EDT, Sam/ }));
    await user.click(screen.getByRole("button", { name: "Book visit" }));

    expect(await screen.findByText("Visit booked")).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((call) => call.path === "visits.book")?.input).toEqual({
        itemId: 3,
        serviceId: 5,
        resourceId: 1,
        startsAt: new Date("2030-03-11T14:00:00Z"),
      })
    );
  });

  it("lists the visits as they stand, on the resource's clock", async () => {
    renderWithBackend(<DealVisits id={3} />, {
      "deals.get": () => deal(4),
      "visits.list": () => [visit("cancelled")],
      "bookings.services": () => services(),
    });

    expect(
      await screen.findByRole("link", { name: /Monday, March 11, 2030, 9:00\sAM EDT/ })
    ).toHaveAttribute("href", "#/bookings/7");
    expect(screen.getByText("Cut with Sam, Cancelled")).toBeVisible();
  });

  it("offers no booking until the deal has a contact", async () => {
    renderWithBackend(<DealVisits id={3} />, {
      "deals.get": () => deal(null),
      "visits.list": () => [],
      "bookings.services": () => services(),
    });

    expect(await screen.findByText(/Choose a contact for this deal to book a visit/)).toBeVisible();
    expect(screen.queryByText("Book a visit")).not.toBeInTheDocument();
  });
});

describe("BookingDeal", () => {
  it("links a booking to the deal it is a visit for", async () => {
    renderWithBackend(<BookingDeal id={7} />, {
      "visits.deal": () => ({ id: 3, title: "Boiler service" }),
    });

    expect(await screen.findByRole("link", { name: "Boiler service" })).toHaveAttribute(
      "href",
      "#/deals/3"
    );
  });

  it("shows nothing for a booking that is not a visit", async () => {
    const calls = renderWithBackend(<BookingDeal id={7} />, { "visits.deal": () => null });

    await waitFor(() => expect(calls.map((call) => call.path)).toContain("visits.deal"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
