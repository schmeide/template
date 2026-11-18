import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  itemUpdateSchema,
  moveSchema,
  newItemSchema,
  newNoteSchema,
  newStageSchema,
  pipelineItems,
  pipelineStages,
  stageUpdateSchema,
} from "../db/schema/pipeline.ts";
import {
  addNote,
  addStage,
  createItem,
  getBoard,
  getItem,
  moveItem,
  moveStage,
  updateItem,
  updateStage,
} from "../services/pipeline.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(pipelineItems).pick({ id: true });
const moveStageSchema = createSelectSchema(pipelineStages)
  .pick({ id: true })
  .extend({ position: z.number().int().min(0) });

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const noDeal = "No deal has that id";
const noStage = "No stage has that id";

export const dealsRouter = router({
  board: procedure.query(({ ctx }) => getBoard(ctx.db)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) => found(await getItem(ctx.db, input.id), noDeal)),
  create: procedure
    .input(newItemSchema)
    .mutation(async ({ ctx, input }) => found(await createItem(ctx.db, input), noStage)),
  update: procedure
    .input(itemUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateItem(ctx.db, input), noDeal)),
  move: procedure
    .input(moveSchema)
    .mutation(async ({ ctx, input }) =>
      found(await moveItem(ctx.db, input), "No deal or stage has that id")
    ),
  addNote: procedure
    .input(newNoteSchema)
    .mutation(async ({ ctx, input }) => found(await addNote(ctx.db, input), noDeal)),
  addStage: procedure.input(newStageSchema).mutation(({ ctx, input }) => addStage(ctx.db, input)),
  updateStage: procedure
    .input(stageUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateStage(ctx.db, input), noStage)),
  moveStage: procedure
    .input(moveStageSchema)
    .mutation(async ({ ctx, input }) =>
      found(await moveStage(ctx.db, input.id, input.position), noStage)
    ),
});
