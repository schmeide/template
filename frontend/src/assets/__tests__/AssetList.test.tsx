import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetList } from "../AssetList.tsx";
import { localDay } from "../format.ts";
import { asset, categories, renderWithBackend, type Call } from "./fakeBackend.tsx";

const page = (rows: readonly ReturnType<typeof asset>[], total = rows.length) => ({ rows, total });

const listCalls = (calls: readonly Call[]) =>
  calls.filter((call) => call.path === "assets.list").map((call) => call.input);

describe("AssetList", () => {
  it("lists assets and sends search, filters and sort to the server", async () => {
    const calls = renderWithBackend(<AssetList />, {
      "assets.categories": () => categories,
      "assets.list": () =>
        page([
          asset(1, "Laptop", { tag: "L-1", owner: "Ana", expiresOn: "2027-05-01" }),
          asset(2, "Van", { category: "Vehicles", status: "in_repair" }),
        ]),
    });
    const user = userEvent.setup();

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Laptop" })).toHaveAttribute(
      "href",
      "#/assets/1"
    );
    expect(within(table).getByText("In repair")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–2 of 2");

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "lap");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("option", { name: "Vehicles" });
    await user.selectOptions(screen.getByLabelText("Category"), "Vehicles");
    await user.selectOptions(screen.getByLabelText("Status"), "Archived");
    await user.selectOptions(screen.getByLabelText("Sort by"), "Expires, latest first");

    await waitFor(() =>
      expect(listCalls(calls)).toContainEqual({
        search: "lap",
        categoryId: 2,
        status: "archived",
        sort: "expiresOn",
        descending: true,
        page: 1,
      })
    );
  });

  it("pages through the results", async () => {
    const calls = renderWithBackend(<AssetList />, {
      "assets.categories": () => categories,
      "assets.list": ({ page: number }: { readonly page: number }) =>
        page([asset(number, `Asset ${number}`)], 120),
    });
    const user = userEvent.setup();
    await screen.findByRole("table");

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(await screen.findByRole("button", { name: "Next page" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Showing 101–120 of 120");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(listCalls(calls)).toContainEqual(expect.objectContaining({ page: 3 }));
  });

  it("points forward when the register is empty, and clears filters that match nothing", async () => {
    renderWithBackend(<AssetList />, {
      "assets.categories": () => categories,
      "assets.list": () => page([]),
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/No assets yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add an asset" })).toHaveAttribute(
      "href",
      "#/assets/new"
    );
    await user.selectOptions(screen.getByLabelText("Status"), "Lost");
    await user.click(await screen.findByRole("button", { name: "Clear filters" }));

    expect(screen.getByLabelText("Status")).toHaveValue("");
  });

  it("downloads the current filter as CSV", async () => {
    const createObjectURL = vi.fn(() => "blob:assets");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    // jsdom cannot follow the download link.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const calls = renderWithBackend(<AssetList />, {
      "assets.categories": () => categories,
      "assets.list": () => page([asset(1, "Laptop")]),
      "assets.exportCsv": () => "Name\r\nLaptop\r\n",
    });
    const user = userEvent.setup();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Status"), "In use");
    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(calls).toContainEqual({
      path: "assets.exportCsv",
      input: { status: "in_use", sort: "name", descending: false },
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows what has expired or expires within the chosen window", async () => {
    const calls = renderWithBackend(<AssetList expiring />, {
      "assets.categories": () => categories,
      "assets.list": () => page([asset(1, "License", { expiresOn: "2020-01-01" })]),
    });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Expired")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Within"), { target: { value: "90" } });

    await waitFor(() =>
      expect(listCalls(calls)).toContainEqual({
        expiring: { today: localDay(), days: 90 },
        sort: "expiresOn",
        descending: false,
        page: 1,
      })
    );
  });
});
