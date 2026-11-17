import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Summary } from "../Summary.tsx";
import { renderWithBackend } from "./fakeBackend.tsx";

const row = (accountId: number, name: string, kind: "in" | "out" | "adjust", quantity: number) => ({
  accountId,
  name,
  unit: "pcs",
  kind,
  quantity,
  entries: 1,
});

describe("Summary", () => {
  it("shows each item's totals by kind for the chosen period", async () => {
    const calls = renderWithBackend(<Summary />, {
      "stock.summary": () => [
        row(1, "Bolts", "in", 12),
        row(1, "Bolts", "out", -4),
        row(2, "Nuts", "adjust", 3),
      ],
    });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });

    const table = await screen.findByRole("table");
    const bolts = within(table).getByRole("row", { name: /Bolts/ });
    expect(
      within(bolts)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["pcs", "+12", "-4", "", "+8"]);
    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "stock.summary",
        input: { from: "2026-03-01", to: "2026-03-31" },
      })
    );
  });

  it("downloads the period's entries as CSV", async () => {
    const createObjectURL = vi.fn(() => "blob:entries");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    // jsdom cannot follow the download link.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const calls = renderWithBackend(<Summary />, {
      "stock.summary": () => [],
      "stock.exportCsv": () => "Entry\r\n",
    });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(calls).toContainEqual({
      path: "stock.exportCsv",
      input: { from: "2026-03-01", to: "2026-03-31" },
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
