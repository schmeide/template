import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Attachments } from "../Attachments.tsx";
import { renderWithBackend } from "./fakeBackend.tsx";

const stored = (id: number, name: string, size: number) => ({
  id,
  name,
  type: "application/pdf",
  size,
  createdAt: new Date("2026-01-01T09:00:00Z"),
});

// Uploads go to a plain HTTP route rather than tRPC, so the test stands in for fetch.
const answer = (status: number, body: unknown) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Attachments", () => {
  it("lists an asset's files as downloads and removes one after asking", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const calls = renderWithBackend(<Attachments id={1} />, {
      "assets.files": () => [
        stored(5, "receipt.pdf", 2048),
        stored(6, "manual.pdf", 3 * 1024 ** 2),
      ],
      "assets.removeFile": () => undefined,
    });
    const user = userEvent.setup();

    const link = await screen.findByRole("link", { name: "receipt.pdf" });
    expect(link).toHaveAttribute("href", "/api/assets/files/5");
    expect(link).toHaveAttribute("download", "receipt.pdf");
    expect(screen.getByText("3 MB")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove receipt.pdf" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Remove receipt.pdf? The file is deleted for good."
    );
    await waitFor(() =>
      expect(calls).toContainEqual({ path: "assets.removeFile", input: { fileId: 5 } })
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Files" })).toHaveFocus());
  });

  it("keeps a file when removing is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const calls = renderWithBackend(<Attachments id={1} />, {
      "assets.files": () => [stored(5, "receipt.pdf", 2048)],
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove receipt.pdf" }));

    expect(calls.map((call) => call.path)).not.toContain("assets.removeFile");
  });

  it("uploads a chosen file to the asset and lists the files again", async () => {
    const fetch = answer(201, stored(7, "photo.png", 10));
    const calls = renderWithBackend(<Attachments id={1} />, { "assets.files": () => [] });
    const user = userEvent.setup();
    const photo = new File(["png"], "photo 1.png", { type: "image/png" });

    expect(await screen.findByText(/No files yet/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Add a file"), photo);

    expect(await screen.findByRole("status")).toHaveTextContent("File added");
    expect(fetch).toHaveBeenCalledWith("/api/assets/1/files?name=photo%201.png", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: photo,
    });
    expect(calls.filter((call) => call.path === "assets.files")).toHaveLength(2);
  });

  it("shows the server's reason when a file is refused", async () => {
    answer(415, { message: "Choose a PDF or PNG file." });
    renderWithBackend(<Attachments id={1} />, { "assets.files": () => [] });
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText("Add a file"),
      new File(["<p>"], "page.html", { type: "text/html" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to add page.html: Choose a PDF or PNG file."
    );
  });
});
