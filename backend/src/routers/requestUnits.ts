import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import { approvalRequests } from "../db/schema/approval.ts";
import { registryRecords } from "../db/schema/registry.ts";
import { setRequestUnitSchema } from "../db/schema/requestUnits.ts";
import {
  requestsForUnit,
  setRequestUnit,
  unitForRequest,
  type Refusal,
} from "../services/requestUnits.ts";
import { procedure, router } from "../trpc.ts";

const refusals: Readonly<Record<Refusal, { code: TRPCError["code"]; message: string }>> = {
  "no request": { code: "NOT_FOUND", message: "No request has that id" },
  "no unit": { code: "NOT_FOUND", message: "No unit has that id" },
  "unit archived": {
    code: "PRECONDITION_FAILED",
    message: "That unit is archived. Choose another, or restore it first.",
  },
};

export const requestUnitsRouter = router({
  // Takes a request's id; null when it has no unit.
  forRequest: procedure
    .input(createSelectSchema(approvalRequests).pick({ id: true }))
    .query(({ ctx, input }) => unitForRequest(ctx.db, input.id)),
  // Takes a unit's id.
  forUnit: procedure
    .input(createSelectSchema(registryRecords).pick({ id: true }))
    .query(({ ctx, input }) => requestsForUnit(ctx.db, input.id)),
  set: procedure.input(setRequestUnitSchema).mutation(async ({ ctx, input }) => {
    const result = await setRequestUnit(ctx.db, input);
    if (typeof result === "string") throw new TRPCError(refusals[result]);
    return result;
  }),
});
