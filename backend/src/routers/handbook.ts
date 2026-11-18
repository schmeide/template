import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import {
  handbookPages,
  moveSchema,
  newPageSchema,
  pageUpdateSchema,
  readSchema,
  searchSchema,
} from "../db/schema/handbook.ts";
import {
  confirmRead,
  createPage,
  getPage,
  listPages,
  movePage,
  searchPages,
  updatePage,
  type Refusal,
} from "../services/handbook.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(handbookPages).pick({ id: true });
const noPage = "No handbook page has that id";

const found = <T>(value: T | undefined): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message: noPage });
  return value;
};

const current = <T>(value: T | Refusal | undefined): T => {
  if (value === "changed") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Someone changed this page since you opened it. Reload it to see the new version.",
    });
  }
  return found(value);
};

// ponytail: until sign-in exists `actorId` is whoever the browser says it is acting as, so a read
// confirmation is only as trustworthy as that choice. Take it from the signed-in user once
// platform sign-in exists (schmeide/schmeide.app#84).
export const handbookRouter = router({
  list: procedure.query(({ ctx }) => listPages(ctx.db)),
  search: procedure.input(searchSchema).query(({ ctx, input }) => searchPages(ctx.db, input.query)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) => found(await getPage(ctx.db, input.id))),
  create: procedure.input(newPageSchema).mutation(({ ctx, input }) => createPage(ctx.db, input)),
  update: procedure
    .input(pageUpdateSchema)
    .mutation(async ({ ctx, input }) => current(await updatePage(ctx.db, input))),
  move: procedure
    .input(moveSchema)
    .mutation(async ({ ctx, input }) => found(await movePage(ctx.db, input.id, input.direction))),
  confirmRead: procedure
    .input(readSchema)
    .mutation(async ({ ctx, input }) => current(await confirmRead(ctx.db, input))),
});
