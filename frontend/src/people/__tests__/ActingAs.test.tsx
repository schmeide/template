import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActingAs, useActingAs } from "../ActingAs.tsx";
import { renderWithBackend } from "./fakeBackend.tsx";

const sam = { id: 1, name: "Sam" };
const dana = { id: 3, name: "Dana" };

function Harness() {
  const [actorId, choose] = useActingAs();
  return <ActingAs people={[sam, dana]} actorId={actorId} onChoose={choose} hint="Pick a name." />;
}

describe("ActingAs", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the chosen name in this browser", async () => {
    window.localStorage.setItem("people.actingAs", String(dana.id));
    renderWithBackend(<Harness />, {});
    const user = userEvent.setup();

    expect(screen.getByLabelText("Acting as")).toHaveValue("3");
    await user.selectOptions(screen.getByLabelText("Acting as"), "Sam");

    expect(screen.getByLabelText("Acting as")).toHaveValue("1");
    expect(window.localStorage.getItem("people.actingAs")).toBe("1");
  });

  it("adds a name and acts as it", async () => {
    const calls = renderWithBackend(<Harness />, { "people.add": () => dana });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Name"), "Dana");
    await user.click(screen.getByRole("button", { name: "Add name" }));

    await waitFor(() => expect(screen.getByLabelText("Acting as")).toHaveValue("3"));
    expect(calls).toContainEqual({ path: "people.add", input: { name: "Dana" } });
  });
});
