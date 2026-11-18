import { TRPCError } from "@trpc/server";
import {
  intakeListSchema,
  intakeSubmissionSchema,
  intakeTokenSchema,
  sendIntakeSchema,
} from "../db/schema/intakes.ts";
import { InvalidAnswers } from "../services/approval.ts";
import { getIntakeForm, listIntakes, sendIntake, submitIntake } from "../services/intakes.ts";
import { takePublicSlot } from "../services/rateLimit.ts";
import { procedure, router } from "../trpc.ts";

const closed = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This link has been used or is not valid. Ask whoever sent it for a new link.",
    });
  }
  return value;
};

// `form` and `submit` serve the link sent to a customer and say nothing about the customer.
// ponytail: until sign-in exists `list` and `send` are open to anyone, like every staff view;
// see docs/shapes/customer-intake.md for what not to collect before platform sign-in.
export const intakesRouter = router({
  list: procedure
    .input(intakeListSchema)
    .query(({ ctx, input }) => listIntakes(ctx.db, input.customerId)),
  send: procedure.input(sendIntakeSchema).mutation(({ ctx, input }) => sendIntake(ctx.db, input)),

  form: procedure
    .input(intakeTokenSchema)
    .query(async ({ ctx, input }) => closed(await getIntakeForm(ctx.db, input.token))),
  submit: procedure.input(intakeSubmissionSchema).mutation(async ({ ctx, input }) => {
    if (!takePublicSlot(`intake ${ctx.ip ?? "unknown"}`)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many forms sent from here. Wait ten minutes and send it again.",
      });
    }
    try {
      return closed(await submitIntake(ctx.db, input));
    } catch (error) {
      if (error instanceof InvalidAnswers) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
      }
      throw error;
    }
  }),
});
