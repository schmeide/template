import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetDetail } from "../AssetDetail.tsx";
import { NewAsset } from "../NewAsset.tsx";
import { asset, categories, renderWithBackend } from "./fakeBackend.tsx";

describe("NewAsset", () => {
  it("adds an asset and opens it", async () => {
    window.location.hash = "#/assets/new";
    const calls = renderWithBackend(<NewAsset />, {
      "assets.categories": () => categories,
      "assets.create": () => asset(7, "Laptop"),
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Name"), "Laptop");
    await user.type(screen.getByLabelText("Asset tag"), "L-7");
    await screen.findByRole("option", { name: "Computers" });
    await user.selectOptions(screen.getByLabelText("Category"), "Computers");
    fireEvent.change(screen.getByLabelText("Expires"), { target: { value: "2027-05-01" } });
    await user.click(screen.getByRole("button", { name: "Add asset" }));

    await waitFor(() => expect(window.location.hash).toBe("#/assets/7"));
    expect(calls).toContainEqual({
      path: "assets.create",
      input: {
        name: "Laptop",
        tag: "L-7",
        categoryId: 1,
        status: "in_use",
        owner: "",
        expiresOn: "2027-05-01",
        notes: "",
      },
    });
  });
});

describe("AssetDetail", () => {
  it("saves changes to an asset", async () => {
    const calls = renderWithBackend(<AssetDetail id={1} />, {
      "assets.categories": () => categories,
      "assets.get": () => asset(1, "Laptop", { owner: "Ana", expiresOn: "2027-05-01" }),
      "assets.update": () => asset(1, "Laptop"),
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Laptop", level: 1 })).toBeInTheDocument();
    await screen.findByRole("option", { name: "Vehicles" });
    await user.selectOptions(screen.getByLabelText("Status"), "In repair");
    await user.clear(screen.getByLabelText("Expires"));
    await user.click(screen.getByRole("button", { name: "Save asset" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(calls).toContainEqual({
      path: "assets.update",
      input: {
        id: 1,
        name: "Laptop",
        tag: "",
        categoryId: 1,
        status: "in_repair",
        owner: "Ana",
        expiresOn: null,
        notes: "",
      },
    });
  });

  it("archives an asset and restores an archived one", async () => {
    const calls = renderWithBackend(<AssetDetail id={1} />, {
      "assets.categories": () => categories,
      "assets.get": () => asset(1, "Van", { archivedAt: new Date("2026-03-01T10:00:00Z") }),
      "assets.restore": () => asset(1, "Van"),
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/This asset was archived/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore asset" }));

    await waitFor(() => expect(calls).toContainEqual({ path: "assets.restore", input: { id: 1 } }));
  });

  it("archives an asset without asking, since it can be restored", async () => {
    const calls = renderWithBackend(<AssetDetail id={1} />, {
      "assets.categories": () => categories,
      "assets.get": () => asset(1, "Van"),
      "assets.archive": () => asset(1, "Van", { archivedAt: new Date() }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Archive asset" }));

    await waitFor(() => expect(calls).toContainEqual({ path: "assets.archive", input: { id: 1 } }));
  });

  it("says when the asset does not exist", async () => {
    renderWithBackend(<AssetDetail id={9} />, {
      "assets.categories": () => categories,
      "assets.get": () => {
        throw new Error("No asset has that id");
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("No asset has that id");
  });
});
