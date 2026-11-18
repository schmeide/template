import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import {
  moveBookingSchema,
  newBookingSchema,
  newExceptionSchema,
  newResourceSchema,
  newRuleSchema,
  newSeriesSchema,
  newServiceSchema,
  publicBookingSchema,
  rangeSchema,
  resourceUpdateSchema,
  schedulerBookings,
  serviceUpdateSchema,
  slotSearchSchema,
  statusSchema,
} from "../db/schema/scheduler.ts";
import {
  addException,
  addRule,
  bookPublicly,
  cancelSeries,
  createBooking,
  createResource,
  createSeries,
  createService,
  deleteException,
  deleteRule,
  findSlots,
  getAvailability,
  getBooking,
  listBookings,
  listResources,
  listServices,
  moveBooking,
  moveSeries,
  setStatus,
  updateResource,
  updateService,
  type SeriesResult,
} from "../services/scheduler.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(schedulerBookings).pick({ id: true });
const resourceIdSchema = createSelectSchema(schedulerBookings).pick({ resourceId: true });

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const free = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "That time is no longer free. Pick another.",
    });
  }
  return value;
};

// A series is all or nothing: name the dates that stopped it.
const allFree = (result: SeriesResult | undefined, nothing: string) => {
  const { booked, unfree } = free(result);
  if (unfree.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Not free on ${unfree.join(", ")}. ${nothing}`,
    });
  }
  return booked;
};

const noResource = "No resource has that id";

// `services`, `slots` and `book` serve the public booking page and return nothing about other
// customers. Everything else is for staff.
// ponytail: until sign-in exists every procedure is open, as in every shape; put the staff ones
// behind it then.
export const bookingsRouter = router({
  services: procedure.query(({ ctx }) => listServices(ctx.db)),
  slots: procedure
    .input(slotSearchSchema)
    .query(async ({ ctx, input }) =>
      found(await findSlots(ctx.db, input), "No service has that id")
    ),
  book: procedure
    .input(publicBookingSchema)
    .mutation(async ({ ctx, input }) => free(await bookPublicly(ctx.db, input))),

  resources: procedure.query(({ ctx }) => listResources(ctx.db)),
  createResource: procedure
    .input(newResourceSchema)
    .mutation(({ ctx, input }) => createResource(ctx.db, input)),
  updateResource: procedure
    .input(resourceUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateResource(ctx.db, input), noResource)),
  createService: procedure
    .input(newServiceSchema)
    .mutation(({ ctx, input }) => createService(ctx.db, input)),
  updateService: procedure
    .input(serviceUpdateSchema)
    .mutation(async ({ ctx, input }) =>
      found(await updateService(ctx.db, input), "No service has that id")
    ),
  availability: procedure
    .input(resourceIdSchema)
    .query(({ ctx, input }) => getAvailability(ctx.db, input.resourceId)),
  addRule: procedure
    .input(newRuleSchema)
    .mutation(async ({ ctx, input }) => found(await addRule(ctx.db, input), noResource)),
  deleteRule: procedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) =>
      found(await deleteRule(ctx.db, input.id), "No hours have that id")
    ),
  addException: procedure
    .input(newExceptionSchema)
    .mutation(async ({ ctx, input }) => found(await addException(ctx.db, input), noResource)),
  deleteException: procedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) =>
      found(await deleteException(ctx.db, input.id), "No exception has that id")
    ),

  list: procedure.input(rangeSchema).query(({ ctx, input }) => listBookings(ctx.db, input)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      found(await getBooking(ctx.db, input.id), "No booking has that id")
    ),
  create: procedure
    .input(newBookingSchema)
    .mutation(async ({ ctx, input }) => free(await createBooking(ctx.db, input))),
  move: procedure
    .input(moveBookingSchema)
    .mutation(async ({ ctx, input }) => free(await moveBooking(ctx.db, input))),
  createSeries: procedure
    .input(newSeriesSchema)
    .mutation(async ({ ctx, input }) =>
      allFree(await createSeries(ctx.db, input), "Nothing was booked.")
    ),
  moveSeries: procedure
    .input(moveBookingSchema)
    .mutation(async ({ ctx, input }) =>
      allFree(await moveSeries(ctx.db, input), "Nothing was moved.")
    ),
  cancelSeries: procedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) =>
      found(await cancelSeries(ctx.db, input.id), "No booking that is still open has that id")
    ),
  setStatus: procedure
    .input(statusSchema)
    .mutation(async ({ ctx, input }) =>
      found(await setStatus(ctx.db, input), "No booking that is still open has that id")
    ),
});
