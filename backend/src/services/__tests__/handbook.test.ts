import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import {
  confirmRead,
  createPage,
  defaultPages,
  getPage,
  listPages,
  movePage,
  searchPages,
  updatePage,
} from "../handbook.ts";
import { addPerson } from "../people.ts";

// Tests share one database, so each writes pages in its own section with its own words.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

// A word no other test uses, which the full-text parser keeps whole.
const word = () => `zq${randomUUID().replaceAll("-", "").slice(0, 12)}`;

const person = () => addPerson(db, { name: randomUUID() });

const page = async (section: string, title = word(), body = "", trackReads = false) => {
  const actor = await person();
  return createPage(db, { title, body, section, trackReads, actorId: actor.id });
};

const titlesIn = async (section: string) =>
  (await listPages(db)).filter((row) => row.section === section).map((row) => row.title);

const current = async (id: number) => {
  const found = await getPage(db, id);
  if (!found) throw new Error("The page is missing");
  return found;
};

describe("handbook pages", () => {
  it("ships a welcome page and lists every page", async () => {
    expect(defaultPages.length).toBeGreaterThan(0);
    expect((await listPages(db)).length).toBeGreaterThan(0);
  });

  it("adds pages at the end of their section and moves them up and down", async () => {
    const section = randomUUID();
    const a = await page(section, "A");
    await page(section, "B");
    const c = await page(section, "C");

    expect(await titlesIn(section)).toEqual(["A", "B", "C"]);
    expect(await movePage(db, c.id, "up")).toBe(true);
    expect(await titlesIn(section)).toEqual(["A", "C", "B"]);
    expect(await movePage(db, a.id, "up")).toBe(true);
    expect(await titlesIn(section)).toEqual(["A", "C", "B"]);
    await movePage(db, a.id, "down");
    expect(await titlesIn(section)).toEqual(["C", "A", "B"]);
    expect(await movePage(db, -1, "down")).toBeUndefined();
  });

  it("keeps positions whole when pages move at the same time", async () => {
    const section = randomUUID();
    const pages = [];
    for (const title of ["A", "B", "C", "D"]) pages.push(await page(section, title));

    await Promise.all(pages.map((row) => movePage(db, row.id, "up")));

    const positions = (await listPages(db))
      .filter((row) => row.section === section)
      .map((row) => row.position);
    expect(positions).toEqual([1, 2, 3, 4]);
  });

  it("puts a page moved to another section at its end", async () => {
    const from = randomUUID();
    const to = randomUUID();
    await page(to, "Existing");
    const moving = await page(from, "Moving");

    const moved = await updatePage(db, {
      ...moving,
      section: to,
      actorId: moving.updatedById ?? 0,
    });

    expect(moved).toMatchObject({ section: to, version: 1 });
    expect(await titlesIn(to)).toEqual(["Existing", "Moving"]);
  });

  it("versions edits to the text, records who made them, and refuses a stale edit", async () => {
    const original = await page(randomUUID(), "Policy", "Old");
    const editor = await person();

    const edited = await updatePage(db, {
      ...original,
      body: "New",
      actorId: editor.id,
    });
    const stale = await updatePage(db, { ...original, body: "Lost", actorId: editor.id });

    expect(edited).toMatchObject({ version: 2, body: "New", updatedById: editor.id });
    expect(stale).toBe("changed");
    expect(await current(original.id)).toMatchObject({ body: "New", updatedByName: editor.name });
    expect(await updatePage(db, { ...original, id: -1, actorId: editor.id })).toBeUndefined();
  });
});

describe("handbook search", () => {
  it("finds pages by a word or the start of a word in the title or the body, titles first", async () => {
    const shared = word();
    const inBody = await page(randomUUID(), "Elsewhere", `Mentions ${shared} once.`);
    const inTitle = await page(randomUUID(), `${shared} policy`, "Body");

    expect((await searchPages(db, shared)).map((row) => row.id)).toEqual([inTitle.id, inBody.id]);
    expect((await searchPages(db, shared.slice(0, 8))).map((row) => row.id)).toEqual(
      expect.arrayContaining([inTitle.id, inBody.id])
    );
  });

  it("needs every word and treats query syntax as plain text", async () => {
    const first = word();
    const second = word();
    const both = await page(randomUUID(), first, `and ${second}`);
    await page(randomUUID(), first, "only one");

    expect(
      (await searchPages(db, `${first} & | ! ( ) : * ' ${second}`)).map((row) => row.id)
    ).toEqual([both.id]);
    expect(await searchPages(db, "  !&|  ")).toEqual([]);
  });
});

describe("handbook read tracking", () => {
  it("records a read of the current version and asks again after an edit", async () => {
    const reader = await person();
    const absent = await person();
    const policy = await page(randomUUID(), "Policy", "v1", true);

    expect(await confirmRead(db, { id: policy.id, version: 1, actorId: reader.id })).toBe(true);
    const readers = (await current(policy.id)).readers;
    expect(readers.find((row) => row.id === reader.id)?.readVersion).toBe(1);
    expect(readers.find((row) => row.id === absent.id)?.readVersion).toBeNull();

    await updatePage(db, { ...policy, body: "v2", actorId: reader.id });
    expect(await confirmRead(db, { id: policy.id, version: 1, actorId: reader.id })).toBe(
      "changed"
    );
    expect(
      (await current(policy.id)).readers.find((row) => row.id === reader.id)?.readVersion
    ).toBe(1);
    await confirmRead(db, { id: policy.id, version: 2, actorId: reader.id });
    expect(
      (await current(policy.id)).readers.find((row) => row.id === reader.id)?.readVersion
    ).toBe(2);
    expect(await confirmRead(db, { id: -1, version: 1, actorId: reader.id })).toBeUndefined();
  });
});
