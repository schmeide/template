import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Categories } from "../Categories.tsx";
import { Import } from "../Import.tsx";
import { categories, category, renderWithBackend } from "./fakeBackend.tsx";

const file = (text: string) => new File([text], "assets.csv", { type: "text/csv" });

describe("Import", () => {
  it("previews a file with bad rows and does not offer to import it", async () => {
    const calls = renderWithBackend(<Import />, {
      "assets.previewImport": () => ({
        ready: 1,
        ignored: ["Color"],
        problems: [{ row: 3, messages: ["Name: Enter a name"] }],
      }),
    });
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("CSV file"), file("Name,Color\nA,red\n,blue\n"));

    const problems = await screen.findByRole("table", { name: "Rows with problems" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "assets.csv: 1 row has a problem, so nothing can be imported."
    );
    expect(within(problems).getByRole("row", { name: /3/ })).toHaveTextContent(
      "Name: Enter a name"
    );
    expect(screen.getByText(/Color/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import/ })).not.toBeInTheDocument();
    expect(calls).toContainEqual({
      path: "assets.previewImport",
      input: { csv: "Name,Color\nA,red\n,blue\n" },
    });
  });

  it("imports a clean file after the preview", async () => {
    const check = { ready: 2, ignored: [], problems: [] };
    const calls = renderWithBackend(<Import />, {
      "assets.previewImport": () => check,
      "assets.import": () => ({ ...check, imported: 2 }),
    });
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("CSV file"), file("Name\nA\nB\n"));
    await user.click(await screen.findByRole("button", { name: "Import 2 assets" }));

    expect(await screen.findByRole("status")).toHaveTextContent("assets.csv: imported 2 assets.");
    expect(calls).toContainEqual({ path: "assets.import", input: { csv: "Name\nA\nB\n" } });
  });

  it("refuses a file over the size limit without sending it", async () => {
    const calls = renderWithBackend(<Import />, {});
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("CSV file"), file("x".repeat(300_001)));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too large/);
    expect(calls).toEqual([]);
  });
});

describe("Categories", () => {
  it("lists categories and adds one", async () => {
    const calls = renderWithBackend(<Categories />, {
      "assets.categories": () => categories,
      "assets.createCategory": () => category(3, "Phones"),
    });
    const user = userEvent.setup();

    expect(await screen.findByText("Vehicles")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Phones");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() =>
      expect(calls).toContainEqual({ path: "assets.createCategory", input: { name: "Phones" } })
    );
  });
});
