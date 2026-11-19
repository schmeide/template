import { TRPCError } from "@trpc/server";
import {
  cancelLeaseSchema,
  endLeaseSchema,
  idSchema,
  leaseFilterSchema,
  leaseUpdateSchema,
  newLeaseSchema,
  todaySchema,
  type Lease,
} from "../db/schema/leases.ts";
import {
  cancelLease,
  createLease,
  endLease,
  getLease,
  listLeases,
  listUnits,
  updateLease,
  type Clash,
  type Refusal,
} from "../services/leases.ts";
import { procedure, router } from "../trpc.ts";

const refusals: Readonly<Record<Refusal, { code: TRPCError["code"]; message: string }>> = {
  "no lease": { code: "NOT_FOUND", message: "No lease has that id" },
  "no unit": { code: "NOT_FOUND", message: "No unit has that id" },
  "unit archived": {
    code: "PRECONDITION_FAILED",
    message: "That unit is archived. Restore it before letting it.",
  },
  "no tenant": { code: "NOT_FOUND", message: "No tenant has that id" },
  cancelled: { code: "CONFLICT", message: "This lease is cancelled and cannot change" },
  started: {
    code: "CONFLICT",
    message: "This lease has started, so it cannot be cancelled. End it instead.",
  },
  "ends later": {
    code: "BAD_REQUEST",
    message: "Ending a lease can only move its last day earlier. Edit the lease to extend it.",
  },
  "before first day": { code: "BAD_REQUEST", message: "The last day is before the first day" },
};

const settled = (result: Lease | Refusal | Clash): Lease => {
  if (typeof result === "string") throw new TRPCError(refusals[result]);
  if ("clash" in result) {
    const { id, firstDay, lastDay } = result.clash;
    throw new TRPCError({
      code: "CONFLICT",
      message: `These dates overlap lease ${id} on this unit, from ${firstDay} ${
        lastDay ? `to ${lastDay}` : "with no last day"
      }.`,
    });
  }
  return result;
};

export const leasesRouter = router({
  list: procedure.input(leaseFilterSchema).query(({ ctx, input }) => listLeases(ctx.db, input)),
  units: procedure.input(todaySchema).query(({ ctx, input }) => listUnits(ctx.db, input.today)),
  get: procedure.input(idSchema).query(async ({ ctx, input }) => {
    const lease = await getLease(ctx.db, input.id);
    if (!lease) throw new TRPCError(refusals["no lease"]);
    return lease;
  }),
  create: procedure
    .input(newLeaseSchema)
    .mutation(async ({ ctx, input }) => settled(await createLease(ctx.db, input))),
  update: procedure
    .input(leaseUpdateSchema)
    .mutation(async ({ ctx, input }) => settled(await updateLease(ctx.db, input))),
  end: procedure
    .input(endLeaseSchema)
    .mutation(async ({ ctx, input }) => settled(await endLease(ctx.db, input))),
  cancel: procedure
    .input(cancelLeaseSchema)
    .mutation(async ({ ctx, input }) => settled(await cancelLease(ctx.db, input))),
});
