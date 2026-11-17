import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOnline } from "../BookOnline.tsx";
import { ny, renderWithBackend, resources, services, slot } from "./fakeBackend.tsx";

const booked = {
  id: 9,
  startsAt: new Date("2030-11-03T06:30:00Z"),
  endsAt: new Date("2030-11-03T07:00:00Z"),
  serviceName: "Cut",
  resourceName: "Sam",
  timeZone: ny,
};

describe("BookOnline", () => {
  it("books a free time in the business's zone, the repeated hour told apart", async () => {
    const calls = renderWithBackend(<BookOnline />, {
      "bookings.services": () => services(),
      "bookings.resources": () => resources(),
      // 01:30 happens twice in New York on the day clocks go back.
      "bookings.slots": () => [slot("2030-11-03T05:30:00Z"), slot("2030-11-03T06:30:00Z")],
      "bookings.book": () => booked,
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Cut, 30 minutes" });
    await user.selectOptions(screen.getByLabelText("Service"), "Cut, 30 minutes");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2030-11-03" } });
    await user.click(await screen.findByRole("radio", { name: /1:30\sAM EST, Sam/ }));
    expect(screen.getByRole("radio", { name: /1:30\sAM EDT, Sam/ })).not.toBeChecked();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Book" }));

    expect(await screen.findByRole("heading", { name: "You are booked" })).toBeInTheDocument();
    expect(
      screen.getByText(/Cut with Sam on Sunday, November 3, 2030 at 1:30\sAM EST/)
    ).toBeVisible();
    expect(calls.filter((call) => call.path === "bookings.slots").at(-1)?.input).toEqual({
      serviceId: 5,
      from: "2030-11-03",
      to: "2030-11-03",
    });
    expect(calls.find((call) => call.path === "bookings.book")?.input).toEqual({
      serviceId: 5,
      resourceId: 1,
      startsAt: new Date("2030-11-03T06:30:00Z"),
      name: "Ada",
      email: "ada@example.com",
      phone: "",
    });
  });

  it("shows places left for a class and says when a time was just taken", async () => {
    const calls = renderWithBackend(<BookOnline />, {
      "bookings.services": () => services(),
      "bookings.resources": () => resources(),
      "bookings.slots": () => [slot("2030-01-14T23:00:00Z", 3)],
      "bookings.book": () => {
        throw new Error("That time is no longer free. Pick another.");
      },
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Yoga, 60 minutes" });
    await user.selectOptions(screen.getByLabelText("Service"), "Yoga, 60 minutes");
    await user.click(await screen.findByRole("radio", { name: /3 places left/ }));
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Book" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to book: That time is no longer free. Pick another."
    );
    await waitFor(() =>
      expect(calls.filter((call) => call.path === "bookings.slots").length).toBeGreaterThan(1)
    );
  });
});
