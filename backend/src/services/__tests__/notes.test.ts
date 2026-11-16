import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { createNote, listNotes } from "../notes.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

describe("notes service", () => {
  it("creates a note and returns it with an id and timestamp", async () => {
    const body = randomUUID();

    const note = await createNote(db, { body });

    expect(note.body).toBe(body);
    expect(note.id).toBeTypeOf("number");
    expect(note.createdAt).toBeInstanceOf(Date);
  });

  it("lists notes newest first", async () => {
    const first = await createNote(db, { body: randomUUID() });
    const second = await createNote(db, { body: randomUUID() });

    const ids = (await listNotes(db)).map((note) => note.id);

    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(ids.indexOf(first.id)).toBeGreaterThanOrEqual(0);
  });
});
