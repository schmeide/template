import { TRPCError } from "@trpc/server";
import {
  addPeriodSchema,
  levelIdSchema,
  levelUpdateSchema,
  memberSchema,
  newLevelSchema,
} from "../db/schema/membership.ts";
import {
  addPeriod,
  createLevel,
  getMember,
  listLevels,
  listMembers,
  retireLevel,
  updateLevel,
} from "../services/membership.ts";
import { procedure, router } from "../trpc.ts";

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const noLevel = "No level has that id";

export const membershipRouter = router({
  levels: procedure.query(({ ctx }) => listLevels(ctx.db)),
  createLevel: procedure
    .input(newLevelSchema)
    .mutation(({ ctx, input }) => createLevel(ctx.db, input)),
  updateLevel: procedure
    .input(levelUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateLevel(ctx.db, input), noLevel)),
  retireLevel: procedure
    .input(levelIdSchema)
    .mutation(async ({ ctx, input }) => found(await retireLevel(ctx.db, input.id), noLevel)),

  members: procedure.query(({ ctx }) => listMembers(ctx.db)),
  member: procedure
    .input(memberSchema)
    .query(async ({ ctx, input }) =>
      found(await getMember(ctx.db, input.customerId), "That customer is not a member")
    ),
  addPeriod: procedure.input(addPeriodSchema).mutation(async ({ ctx, input }) => {
    const result = await addPeriod(ctx.db, input);
    if (result === "not found") {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Pick a customer and a level that is not retired",
      });
    }
    if (result === "changed") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Someone added a period meanwhile. Reload to see it before renewing again.",
      });
    }
    if (result === "life member") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This is a member for life, so there is nothing to renew",
      });
    }
    return result;
  }),
});
