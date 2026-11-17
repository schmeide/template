import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TypeSettings } from "../TypeSettings.tsx";
import { kim, leave, renderWithBackend, sam } from "./fakeBackend.tsx";

const renderSettings = (types = [leave]) =>
  renderWithBackend(<TypeSettings people={[sam, kim]} />, {
    "requests.types": () => types,
    "requests.createType": () => leave,
    "requests.updateType": () => leave,
    "requests.setPublic": () => ({ ...leave, publicToken: "x" }),
  });

describe("TypeSettings", () => {
  it("adds a checklist type with an approver", async () => {
    const calls = renderSettings();
    const user = userEvent.setup();

    const adding = await screen.findByRole("form", { name: "New request type" });
    await user.type(within(adding).getByLabelText("Name"), "Van inspection");
    await user.selectOptions(within(adding).getByLabelText("Approver"), "Kim");
    await user.type(within(adding).getByLabelText("Label"), "Brakes");
    await user.selectOptions(within(adding).getByLabelText("Kind"), "Pass or fail");
    await user.click(within(adding).getByLabelText("Required"));
    await user.click(within(adding).getByRole("button", { name: "Add field" }));
    const second = within(adding).getByRole("group", { name: "Field 2" });
    await user.type(within(second).getByLabelText("Label"), "Tires");
    await user.selectOptions(within(second).getByLabelText("Kind"), "Choice");
    await user.type(within(second).getByLabelText("Options"), "Good, Worn");
    await user.click(within(adding).getByRole("button", { name: "Add type" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "requests.createType")).toEqual([
        {
          path: "requests.createType",
          input: {
            name: "Van inspection",
            approverId: kim.id,
            fields: [
              { label: "Brakes", kind: "check", required: true },
              { label: "Tires", kind: "choice", required: false, options: ["Good", "Worn"] },
            ],
          },
        },
      ])
    );
  });

  it("removes a field from a type and saves it", async () => {
    const calls = renderSettings();
    const user = userEvent.setup();

    const editing = await screen.findByRole("form", { name: "Leave" });
    await user.click(within(editing).getByRole("button", { name: "Remove field 3" }));
    await user.click(within(editing).getByRole("button", { name: "Save type" }));

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "requests.updateType")).toEqual([
        {
          path: "requests.updateType",
          input: {
            id: leave.id,
            name: "Leave",
            approverId: null,
            fields: leave.fields.slice(0, 2),
          },
        },
      ])
    );
  });

  it("opens a public link and shows it", async () => {
    const token = "6f1c2c1e-5d4a-4b8e-9a51-0c4f7e2b9d10";
    const calls = renderSettings([{ ...leave, publicToken: token }]);
    const user = userEvent.setup();

    expect(await screen.findByLabelText("Public link")).toHaveValue(
      `${window.location.origin}${window.location.pathname}#/requests/form/${token}`
    );
    await user.click(screen.getByLabelText("Take requests from anyone with the link"));

    await waitFor(() =>
      expect(calls.filter((call) => call.path === "requests.setPublic")).toEqual([
        { path: "requests.setPublic", input: { id: leave.id, open: false } },
      ])
    );
  });
});
