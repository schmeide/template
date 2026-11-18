import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { NewRecord } from "../../db/schema/registry.ts";
import { parseCsv } from "../csv.ts";
import { saveFile } from "../files.ts";
import {
  archiveRecord,
  attachFile,
  getAttachment,
  listAttachments,
  removeAttachment,
  commitImport,
  createCategory,
  createRecord,
  exportRecords,
  getRecord,
  listCategories,
  listRecords,
  previewImport,
  restoreRecord,
  updateRecord,
} from "../registry.ts";

// Tests share one database, so each makes its own category and filters the list to it.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newCategory = async () => {
  const category = await createCategory(db, { name: randomUUID() });
  if (typeof category === "string") throw new Error("The category name was taken");
  return category;
};

const record = (categoryId: number, name: string, fields: Partial<NewRecord> = {}) =>
  createRecord(db, { name, categoryId, ...fields });

const names = async (categoryId: number, filter: Parameters<typeof listRecords>[1] = {}) =>
  (await listRecords(db, { categoryId, ...filter })).rows.map((row) => row.name);

describe("registry service", () => {
  it("creates, reads and edits a record with its category name", async () => {
    const category = await newCategory();
    const created = await record(category.id, "Laptop", { tag: "A-1" });

    expect(created).toMatchObject({ name: "Laptop", tag: "A-1", status: "in_use", owner: "" });
    const updated = await updateRecord(db, {
      id: created.id,
      name: "Laptop 14",
      categoryId: category.id,
      status: "in_repair",
      owner: "Sam",
      expiresOn: "2027-01-31",
    });
    expect(updated).toMatchObject({ name: "Laptop 14", status: "in_repair", tag: "" });
    expect(await getRecord(db, created.id)).toMatchObject({
      name: "Laptop 14",
      category: category.name,
      expiresOn: "2027-01-31",
    });
    expect(await getRecord(db, -1)).toBeUndefined();
    expect(await updateRecord(db, { id: -1, name: "Gone" })).toBeUndefined();
  });

  it("refuses a second category with the same name and lists categories", async () => {
    const category = await newCategory();

    expect(await createCategory(db, { name: category.name })).toBe("duplicate");
    expect(await listCategories(db)).toContainEqual(category);
  });

  it("searches name, tag, owner and notes, ignoring case", async () => {
    const category = await newCategory();
    const word = randomUUID().slice(0, 8);
    await record(category.id, `Desk ${word.toUpperCase()}`);
    await record(category.id, "Chair", { tag: `T-${word}` });
    await record(category.id, "Lamp", { owner: word });
    await record(category.id, "Shelf", { notes: `bought with ${word}` });
    await record(category.id, "Other");

    expect(await names(category.id, { search: word })).toEqual([
      "Chair",
      `Desk ${word.toUpperCase()}`,
      "Lamp",
      "Shelf",
    ]);
    expect(await names(category.id, { search: "100%_" })).toEqual([]);
  });

  it("filters by category and status", async () => {
    const category = await newCategory();
    const other = await newCategory();
    await record(category.id, "Drill", { status: "in_repair" });
    await record(category.id, "Saw");
    await record(other.id, "Hammer", { status: "in_repair" });

    expect(await names(category.id)).toEqual(["Drill", "Saw"]);
    expect(await names(category.id, { status: "in_repair" })).toEqual(["Drill"]);
  });

  it("sorts and pages stably, with a total for the whole filter", async () => {
    const category = await newCategory();
    // Equal names and dates, so only the id tiebreaker orders them.
    for (const name of ["B", "A", "B", "C", "B"]) {
      await record(category.id, name, { expiresOn: name === "C" ? null : "2027-01-01" });
    }

    const page = (pageNumber: number, descending = false) =>
      listRecords(db, { categoryId: category.id, page: pageNumber, pageSize: 2, descending });
    const first = await page(1);
    const pages = [first, await page(2), await page(3)];
    const all = pages.flatMap(({ rows }) => rows);
    expect(first.total).toBe(5);
    expect(all.map((row) => row.name)).toEqual(["A", "B", "B", "B", "C"]);
    expect(new Set(all.map((row) => row.id)).size).toBe(5);
    expect((await page(1, true)).rows.map((row) => row.name)).toEqual(["C", "B"]);
    // Records with no date come last either way.
    const byDate = await listRecords(db, { categoryId: category.id, sort: "expiresOn" });
    expect(byDate.rows.at(-1)?.name).toBe("C");
    const byDateDescending = await listRecords(db, {
      categoryId: category.id,
      sort: "expiresOn",
      descending: true,
    });
    expect(byDateDescending.rows.at(-1)?.name).toBe("C");
  });

  it("archives a record out of the default list and restores it with its status", async () => {
    const category = await newCategory();
    const kept = await record(category.id, "Van", { status: "in_storage" });
    await record(category.id, "Truck");

    expect(await archiveRecord(db, kept.id)).toMatchObject({ archivedAt: expect.any(Date) });
    expect(await names(category.id)).toEqual(["Truck"]);
    expect(await names(category.id, { status: "in_storage" })).toEqual([]);
    expect(await names(category.id, { status: "archived" })).toEqual(["Van"]);
    expect(await restoreRecord(db, kept.id)).toMatchObject({
      archivedAt: null,
      status: "in_storage",
    });
    expect(await names(category.id)).toEqual(["Truck", "Van"]);
    expect(await archiveRecord(db, -1)).toBeUndefined();
  });

  it("lists records expired or due within the window, both ends included", async () => {
    const category = await newCategory();
    await record(category.id, "Expired", { expiresOn: "2026-01-01" });
    await record(category.id, "Today", { expiresOn: "2026-03-10" });
    await record(category.id, "Last day", { expiresOn: "2026-04-09" });
    await record(category.id, "Day after", { expiresOn: "2026-04-10" });
    await record(category.id, "Never");

    expect(
      await names(category.id, {
        expiring: { today: "2026-03-10", days: 30 },
        sort: "expiresOn",
      })
    ).toEqual(["Expired", "Today", "Last day"]);
  });

  it("exports the filtered records as CSV, without paging", async () => {
    const category = await newCategory();
    await record(category.id, "Phone", { tag: "P-1", owner: "Ana", expiresOn: "2027-05-01" });
    await record(category.id, "Tablet", { status: "lost" });

    const rows = parseCsv(await exportRecords(db, { categoryId: category.id, status: "lost" }));
    expect(rows).toEqual([
      ["Name", "Tag", "Category", "Status", "Owner", "Expires", "Notes"],
      ["Tablet", "", category.name, "lost", "", "", ""],
    ]);
  });

  it("previews an import with bad rows, imports nothing, then imports the fixed file", async () => {
    const category = await newCategory();
    const csv = (badRows: string) =>
      [
        "﻿name,Category,STATUS,Owner,Expires,Notes,Color",
        `Router,${category.name},In use,Ana,2027-02-01,"rack 2, shelf 1",red`,
        `,${category.name},,,,,`,
        `Switch,No such category,broken,,01/02/2027,,`,
        badRows,
        `"Patch panel",${category.name.toUpperCase()},in storage,,,,`,
      ].join("\r\n");
    const bad = csv(",,,,,,");

    const preview = await previewImport(db, bad);
    expect(preview).toEqual({
      ready: 2,
      ignored: ["Color"],
      problems: [
        { row: 3, messages: ["Name: Enter a name"] },
        {
          row: 4,
          messages: [
            "Category: No category is named “No such category”. Add it first or leave the cell empty.",
            "Status: Use one of in use, in storage, in repair, lost.",
            "Expires: Use a date written as YYYY-MM-DD.",
          ],
        },
      ],
    });
    expect(await commitImport(db, bad)).toEqual({ ...preview, imported: 0 });
    expect(await names(category.id)).toEqual([]);

    const fixed = [bad.split("\r\n")[0], bad.split("\r\n")[1], bad.split("\r\n")[5]].join("\n");
    expect(await commitImport(db, fixed)).toMatchObject({ imported: 2, problems: [] });
    const imported = await listRecords(db, { categoryId: category.id });
    expect(imported.rows).toMatchObject([
      { name: "Patch panel", status: "in_storage" },
      { name: "Router", owner: "Ana", expiresOn: "2027-02-01", notes: "rack 2, shelf 1" },
    ]);
  });

  it("reports a file with no name column, an unclosed quote, or too many rows", async () => {
    expect((await previewImport(db, "Title\nX")).problems).toEqual([
      { row: 1, messages: ["The first row must name the columns and include Name."] },
    ]);
    expect((await previewImport(db, 'Name\nA\n"B')).problems).toEqual([
      { row: 3, messages: ["A quote opened on row 3 is never closed"] },
    ]);
    expect((await previewImport(db, "")).problems).toEqual([
      { row: 1, messages: ["The file is empty."] },
    ]);
    const many = ["Name", ...Array.from({ length: 5001 }, (_, index) => `Item ${index}`)];
    expect((await previewImport(db, many.join("\n"))).problems).toEqual([
      {
        row: 5002,
        messages: ["A file can hold at most 5000 rows. Split it and import each part."],
      },
    ]);
  });
});

describe("registry attachments", () => {
  const pdf = (name: string) => ({
    name,
    type: "application/pdf",
    bytes: new Uint8Array([37, 80, 68, 70]),
  });

  it("attaches, lists, reads and removes a record's files, and keeps them when archived", async () => {
    const asset = await record((await newCategory()).id, "Van");

    const receipt = await attachFile(db, asset.id, pdf("receipt.pdf"));
    const manual = await attachFile(db, asset.id, pdf("manual.pdf"));
    if (!receipt || !("file" in receipt) || !manual || !("file" in manual)) {
      throw new Error("The files were not attached");
    }

    expect(await listAttachments(db, asset.id)).toEqual([receipt.file, manual.file]);
    expect(receipt.file).toMatchObject({ name: "receipt.pdf", type: "application/pdf", size: 4 });
    await archiveRecord(db, asset.id);
    expect(await listAttachments(db, asset.id)).toHaveLength(2);
    const read = await getAttachment(db, receipt.file.id);
    expect(read).toMatchObject({ name: "receipt.pdf", type: "application/pdf" });
    expect(new Uint8Array(read?.bytes ?? [])).toEqual(pdf("").bytes);

    expect(await removeAttachment(db, receipt.file.id)).toBe(true);
    expect(await removeAttachment(db, receipt.file.id)).toBe(false);
    expect(await getAttachment(db, receipt.file.id)).toBeUndefined();
    expect(await listAttachments(db, asset.id)).toEqual([manual.file]);
  });

  it("refuses a file over a limit, and a record that does not exist", async () => {
    const asset = await record((await newCategory()).id, "Van");

    expect(await attachFile(db, asset.id, { ...pdf("page.html"), type: "text/html" })).toEqual({
      problem: "Choose a PDF, JPEG, PNG, WebP, HEIC, text, CSV, Word or Excel file.",
    });
    expect(await attachFile(db, -1, pdf("receipt.pdf"))).toBeUndefined();
    expect(await listAttachments(db, asset.id)).toEqual([]);
  });

  it("serves and removes only files attached to a record", async () => {
    const loose = await saveFile(db, pdf("loose.pdf"));

    expect(await getAttachment(db, loose.id)).toBeUndefined();
    expect(await removeAttachment(db, loose.id)).toBe(false);
  });
});
