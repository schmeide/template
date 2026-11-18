import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../Dashboard.tsx";
import { localDay, presets } from "../range.ts";
import { renderWithBackend } from "./fakeBackend.tsx";

const backend = {
  "dashboard.categories": () => ["Hardware", "Services"],
  "dashboard.totals": () => ({ revenue: 123456, sales: 12, average: 10288 }),
  "dashboard.series": () => ({
    unit: "day",
    points: [
      { period: "2026-11-01", revenue: 100000, sales: 10 },
      { period: "2026-11-02", revenue: 0, sales: 0 },
      { period: "2026-11-03", revenue: 23456, sales: 2 },
    ],
  }),
  "dashboard.breakdown": () => [
    { category: "Hardware", revenue: 100000, sales: 9 },
    { category: "Services", revenue: 23456, sales: 3 },
  ],
  "dashboard.exportCsv": () => "Category\r\n",
};

const range = (key: string) => {
  const preset = presets(localDay()).find((candidate) => candidate.key === key);
  if (!preset) throw new Error(`No preset ${key}`);
  return { from: preset.from, to: preset.to };
};

describe("Dashboard", () => {
  it("shows this month's tiles, chart and tables, and says the data is a sample", async () => {
    const calls = renderWithBackend(<Dashboard />, backend);

    expect(await screen.findByText("$1,234.56")).toBeInTheDocument();
    expect(screen.getByText(/sample data/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Revenue by day/ })).toBeInTheDocument();
    const breakdown = await screen.findByRole("table", { name: /Revenue by category/ });
    const hardware = within(breakdown).getByRole("row", { name: /Hardware/ });
    expect(
      within(hardware)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["9", "$1,000.00", "81%"]);
    const days = screen.getByRole("table", { name: /Revenue by day/ });
    expect(within(days).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(calls).toContainEqual({ path: "dashboard.totals", input: range("month") });
  });

  it("switches to a preset and to one category", async () => {
    const calls = renderWithBackend(<Dashboard />, backend);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Last month" }));
    await screen.findByRole("option", { name: "Services" });
    await user.selectOptions(screen.getByLabelText("Category"), "Services");

    await waitFor(() =>
      expect(calls).toContainEqual({
        path: "dashboard.series",
        input: { ...range("lastMonth"), category: "Services" },
      })
    );
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("downloads a table as CSV", async () => {
    const createObjectURL = vi.fn(() => "blob:breakdown");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const calls = renderWithBackend(<Dashboard />, backend);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Download CSV of revenue by category" })
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(calls).toContainEqual({
      path: "dashboard.exportCsv",
      input: { ...range("month"), table: "breakdown" },
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
