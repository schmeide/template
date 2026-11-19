import { TRPCError } from "@trpc/server";
import {
  accountSchema,
  personSchema,
  requestSchema,
  setLeaveAccountSchema,
} from "../db/schema/leave.ts";
import {
  getPosting,
  listForAccount,
  listLeaveAccounts,
  postLeave,
  setLeaveAccount,
} from "../services/leave.ts";
import { procedure, router } from "../trpc.ts";

// A problem the service put in words is a conflict to show as it is.
const accepted = <T>(value: T | { readonly problem: string } | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No request has that id" });
  }
  if (value !== null && typeof value === "object" && "problem" in value) {
    throw new TRPCError({ code: "CONFLICT", message: value.problem });
  }
  return value;
};

export const leaveRouter = router({
  accounts: procedure
    .input(personSchema)
    .query(({ ctx, input }) => listLeaveAccounts(ctx.db, input.personId)),
  setAccount: procedure
    .input(setLeaveAccountSchema)
    .mutation(async ({ ctx, input }) => accepted(await setLeaveAccount(ctx.db, input))),
  forRequest: procedure
    .input(requestSchema)
    .query(({ ctx, input }) => getPosting(ctx.db, input.requestId)),
  forAccount: procedure
    .input(accountSchema)
    .query(({ ctx, input }) => listForAccount(ctx.db, input.accountId)),
  post: procedure
    .input(requestSchema)
    .mutation(async ({ ctx, input }) => accepted(await postLeave(ctx.db, input.requestId))),
});
