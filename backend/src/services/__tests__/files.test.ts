import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { fileLimits, files } from "../../db/schema/files.ts";
import { fileProblem, saveFile } from "../files.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const upload = (overrides: Partial<Parameters<typeof fileProblem>[0]> = {}) => ({
  name: `${randomUUID()}.pdf`,
  type: "application/pdf",
  bytes: new Uint8Array([37, 80, 68, 70]),
  ...overrides,
});

describe("fileProblem", () => {
  it("accepts an allowed type up to the size cap", () => {
    expect(fileProblem(upload())).toBeUndefined();
    expect(fileProblem(upload({ bytes: new Uint8Array(fileLimits.bytes) }))).toBeUndefined();
  });

  it("refuses a file one byte over the cap", () => {
    expect(fileProblem(upload({ bytes: new Uint8Array(fileLimits.bytes + 1) }))).toBe(
      "A file can be at most 10 MB. Choose a smaller one."
    );
  });

  it.each(["text/html", "image/svg+xml", "", "constructor"])("refuses the type %j", (type) => {
    expect(fileProblem(upload({ type }))).toBe(
      "Choose a PDF, JPEG, PNG, WebP, HEIC, text, CSV, Word or Excel file."
    );
  });

  it("refuses an empty file and a blank name", () => {
    expect(fileProblem(upload({ bytes: new Uint8Array() }))).toBe("The file is empty.");
    expect(fileProblem(upload({ name: "  " }))).toBe("The file has no name.");
    expect(fileProblem(upload({ name: "a".repeat(256) }))).toBe(
      "A file name can be at most 255 characters. Rename the file."
    );
  });
});

describe("saveFile", () => {
  it("stores the bytes and returns the file without them", async () => {
    const input = upload();

    const saved = await saveFile(db, input);

    expect(saved).toEqual({
      id: expect.any(Number),
      name: input.name,
      type: "application/pdf",
      size: 4,
      createdAt: expect.any(Date),
    });
    const [stored] = await db.select().from(files).where(eq(files.id, saved.id));
    expect(new Uint8Array(stored.bytes)).toEqual(input.bytes);
  });
});
