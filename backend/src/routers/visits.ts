import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { bookVisitSchema, dealBookings } from "../db/schema/visits.ts";
import { bookVisit, getVisitDeal, listVisits } from "../services/visits.ts";
import { procedure, router } from "../trpc.ts";

const refusals = {
  noDeal: { code: "NOT_FOUND", message: "No deal has that id" },
  noContact: {
    code: "PRECONDITION_FAILED",
    message: "Give the deal a contact first. A visit is booked for the deal's contact.",
  },
  taken: { code: "CONFLICT", message: "That time is no longer free. Pick another." },
} as const;

export const visitsRouter = router({
  list: procedure
    .input(createSelectSchema(dealBookings).pick({ itemId: true }))
    .query(({ ctx, input }) => listVisits(ctx.db, input.itemId)),
  deal: procedure
    .input(createSelectSchema(dealBookings).pick({ bookingId: true }))
    .query(({ ctx, input }) => getVisitDeal(ctx.db, input.bookingId)),
  book: procedure.input(bookVisitSchema).mutation(async ({ ctx, input }) => {
    const booking = await bookVisit(ctx.db, input);
    if (typeof booking === "string") throw new TRPCError(refusals[booking]);
    return booking;
  }),
});
