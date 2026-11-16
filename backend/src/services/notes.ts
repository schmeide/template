import { desc } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { notes, type NewNote, type Note } from "../db/schema/notes.ts";

export const listNotes = (db: Db): Promise<readonly Note[]> =>
  db.select().from(notes).orderBy(desc(notes.id));

export const createNote = async (db: Db, input: Readonly<NewNote>): Promise<Note> => {
  const [note] = await db.insert(notes).values(input).returning();
  return note;
};
