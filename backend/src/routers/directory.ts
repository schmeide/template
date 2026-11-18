import { TRPCError } from "@trpc/server";
import {
  newStaffSchema,
  personIdSchema,
  saveEntrySchema,
  staffFilterSchema,
} from "../db/schema/directory.ts";
import { addStaff, getStaff, listStaff, listTeams, saveEntry } from "../services/directory.ts";
import { procedure, router } from "../trpc.ts";

const found = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No person has that id" });
  }
  return value;
};

// ponytail: open to every visitor until sign-in exists (schmeide/schmeide.app#84).
export const directoryRouter = router({
  list: procedure.input(staffFilterSchema).query(({ ctx, input }) => listStaff(ctx.db, input)),
  teams: procedure.query(({ ctx }) => listTeams(ctx.db)),
  get: procedure
    .input(personIdSchema)
    .query(async ({ ctx, input }) => found(await getStaff(ctx.db, input.personId))),
  save: procedure
    .input(saveEntrySchema)
    .mutation(async ({ ctx, input }) => found(await saveEntry(ctx.db, input))),
  add: procedure.input(newStaffSchema).mutation(async ({ ctx, input }) => {
    const staff = await addStaff(ctx.db, input);
    if (staff === "listed") {
      throw new TRPCError({
        code: "CONFLICT",
        message: `${input.name} is already in the directory. Open their page to change it.`,
      });
    }
    return staff;
  }),
});
