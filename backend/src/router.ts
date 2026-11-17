import { notesRouter } from "./routers/notes.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
