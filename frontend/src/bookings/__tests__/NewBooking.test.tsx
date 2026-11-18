import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewBooking } from "../NewBooking.tsx";
import { renderWithBackend, resources, services, slot } from "./fakeBackend.tsx";

const customers = () => [
  {
    id: 4,
    name: "Ada",
    email: "",
    phone: "",
    address: "",
    createdAt: new Date("2030-01-01"),
  },
];

const handlers = {
  "customers.list": customers,
  "bookings.services": services,
  "bookings.resources": resources,
  "bookings.slots": () => [slot("2030-03-04T14:00:00Z")],
};

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole("option", { name: "Ada" });
  await screen.findByRole("option", { name: "Cut, 30 minutes" });
  await user.selectOptions(screen.getByLabelText("Customer"), "Ada");
  await user.selectOptions(screen.getByLabelText("Service"), "Cut, 30 minutes");
  await user.clear(screen.getByLabelText("Date"));
  await user.type(screen.getByLabelText("Date"), "2030-03-04");
  await user.click(await screen.findByRole("radio", { name: /9:00\sAM EST, Sam/ }));
};

describe("NewBooking", () => {
  it("books one time when the booking does not repeat", async () => {
    const calls = renderWithBackend(<NewBooking />, {
      ...handlers,
      "bookings.create": () => ({ id: 9 }),
    });
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Book" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "bookings.create")?.input).toEqual({
        serviceId: 5,
        resourceId: 1,
        startsAt: new Date("2030-03-04T14:00:00Z"),
        customerId: 4,
      })
    );
  });

  it("books a series every two weeks for a number of bookings, or until a date", async () => {
    const calls = renderWithBackend(<NewBooking />, {
      ...handlers,
      "bookings.createSeries": () => [{ id: 9 }],
    });
    const user = userEvent.setup();

    await fill(user);
    await user.selectOptions(screen.getByLabelText("Repeats"), "Every 2 weeks");
    await user.clear(screen.getByLabelText("Number of bookings"));
    await user.type(screen.getByLabelText("Number of bookings"), "6");
    await user.click(screen.getByRole("button", { name: "Book" }));
    await user.selectOptions(screen.getByLabelText("Ends"), "On a date");
    await user.type(screen.getByLabelText("Last date"), "2030-06-30");
    await user.click(screen.getByRole("button", { name: "Book" }));

    const slotInput = {
      serviceId: 5,
      resourceId: 1,
      startsAt: new Date("2030-03-04T14:00:00Z"),
      customerId: 4,
      everyWeeks: 2,
    };
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === "bookings.createSeries").map((call) => call.input)
      ).toEqual([
        { ...slotInput, count: 6 },
        { ...slotInput, until: "2030-06-30" },
      ])
    );
  });

  it("names the dates that stopped a series", async () => {
    renderWithBackend(<NewBooking />, {
      ...handlers,
      "bookings.createSeries": () => {
        throw new Error("Not free on 2030-03-11. Nothing was booked.");
      },
    });
    const user = userEvent.setup();

    await fill(user);
    await user.selectOptions(screen.getByLabelText("Repeats"), "Every week");
    await user.click(screen.getByRole("button", { name: "Book" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to book: Not free on 2030-03-11. Nothing was booked."
    );
  });
});
