import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../Settings.tsx";
import { renderWithBackend, resources, services } from "./fakeBackend.tsx";

describe("Settings", () => {
  it("edits and adds resources and services", async () => {
    const calls = renderWithBackend(<Settings />, {
      "bookings.resources": () => resources(),
      "bookings.services": () => services(),
      "bookings.updateResource": () => ({}),
      "bookings.createResource": () => ({}),
      "bookings.createService": () => ({}),
      "bookings.updateService": () => ({}),
    });
    const user = userEvent.setup();

    const yoga = await screen.findByRole("form", { name: "Service Yoga" });
    expect(within(yoga).getByLabelText("Places")).toHaveValue(10);
    await user.clear(within(yoga).getByLabelText("Places"));
    await user.type(within(yoga).getByLabelText("Places"), "12");
    await user.click(within(yoga).getByRole("button", { name: "Save" }));
    const room = screen.getByRole("form", { name: "Add a resource" });
    await user.type(within(room).getByLabelText("Name"), "Room 2");
    await user.selectOptions(within(room).getByLabelText("Time zone"), "Europe/Berlin");
    await user.click(within(room).getByRole("button", { name: "Add resource" }));

    await waitFor(() =>
      expect(
        calls.filter((call) => !["bookings.resources", "bookings.services"].includes(call.path))
      ).toEqual([
        {
          path: "bookings.updateService",
          input: { id: 6, name: "Yoga", durationMinutes: 60, bufferMinutes: 0, capacity: 12 },
        },
        {
          path: "bookings.createResource",
          input: { name: "Room 2", kind: "", timeZone: "Europe/Berlin" },
        },
      ])
    );
  });
});
