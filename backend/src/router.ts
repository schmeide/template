import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Db } from "./db/client.ts";
import { newNoteSchema } from "./db/schema.ts";
import { createNote, listNotes } from "./services/notes.ts";

export type Context = { readonly db: Db };

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const appRouter = t.router({
  notes: t.router({
    list: t.procedure.query(({ ctx }) => listNotes(ctx.db)),
    create: t.procedure
      .input(newNoteSchema)
      .mutation(({ ctx, input }) => createNote(ctx.db, input)),
  }),
});

export type AppRouter = typeof appRouter;
