import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  approvalRequests,
  approvalTypes,
  listFilterSchema,
  newRequestSchema,
  newTypeSchema,
  publicRequestSchema,
  requestUpdateSchema,
  transitionSchema,
  typeUpdateSchema,
} from "../db/schema/approval.ts";
import {
  createRequest,
  createType,
  getPublicForm,
  getRequest,
  InvalidAnswers,
  listRequests,
  listTypes,
  setPublic,
  submitPublicly,
  transition,
  updateRequest,
  updateType,
} from "../services/approval.ts";
import { takePublicSlot } from "../services/rateLimit.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(approvalRequests).pick({ id: true });
const publicSchema = createSelectSchema(approvalTypes)
  .pick({ id: true })
  .extend({ open: z.boolean() });
const tokenSchema = z.object({ token: z.uuid() });

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const allowed = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "That step is not open to you on this request now. Reload it to see where it stands.",
    });
  }
  return value;
};

// Answers that do not fit the request type's fields are the caller's mistake.
const answered = async <T>(work: Promise<T>): Promise<T> => {
  try {
    return await work;
  } catch (error) {
    if (error instanceof InvalidAnswers) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
    }
    throw error;
  }
};

const noType = "No request type has that id";

// `publicForm` and `submitPublic` serve the public link and return nothing about other requests.
// ponytail: until sign-in exists every procedure is open and `actorId` is whoever the browser says
// it is acting as; take the actor from the signed-in user once platform sign-in exists
// (schmeide/schmeide.app#84).
export const requestsRouter = router({
  types: procedure.query(({ ctx }) => listTypes(ctx.db)),
  createType: procedure
    .input(newTypeSchema)
    .mutation(({ ctx, input }) => createType(ctx.db, input)),
  updateType: procedure
    .input(typeUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateType(ctx.db, input), noType)),
  setPublic: procedure
    .input(publicSchema)
    .mutation(async ({ ctx, input }) =>
      found(await setPublic(ctx.db, input.id, input.open), noType)
    ),

  list: procedure.input(listFilterSchema).query(({ ctx, input }) => listRequests(ctx.db, input)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      found(await getRequest(ctx.db, input.id), "No request has that id")
    ),
  create: procedure
    .input(newRequestSchema)
    .mutation(async ({ ctx, input }) =>
      found(await answered(createRequest(ctx.db, input)), noType)
    ),
  update: procedure
    .input(requestUpdateSchema)
    .mutation(async ({ ctx, input }) => allowed(await answered(updateRequest(ctx.db, input)))),
  transition: procedure
    .input(transitionSchema)
    .mutation(async ({ ctx, input }) => allowed(await answered(transition(ctx.db, input)))),

  publicForm: procedure
    .input(tokenSchema)
    .query(async ({ ctx, input }) =>
      found(await getPublicForm(ctx.db, input.token), "This form is not open")
    ),
  submitPublic: procedure.input(publicRequestSchema).mutation(async ({ ctx, input }) => {
    if (!takePublicSlot(`requests ${ctx.ip ?? "unknown"}`)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many forms sent from here. Wait ten minutes and send it again.",
      });
    }
    return found(await answered(submitPublicly(ctx.db, input)), "This form is not open");
  }),
});
