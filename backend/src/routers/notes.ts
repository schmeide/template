import { newNoteSchema } from "../db/schema/notes.ts";
import { createNote, listNotes } from "../services/notes.ts";
import { procedure, router } from "../trpc.ts";

export const notesRouter = router({
  list: procedure.query(({ ctx }) => listNotes(ctx.db)),
  create: procedure.input(newNoteSchema).mutation(({ ctx, input }) => createNote(ctx.db, input)),
});
