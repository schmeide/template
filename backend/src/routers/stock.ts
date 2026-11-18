import { TRPCError } from "@trpc/server";
import { createSelectSchema } from "drizzle-zod";
import {
  accountUpdateSchema,
  ledgerAccounts,
  newAccountSchema,
  newEntrySchema,
  periodSchema,
  reversalSchema,
} from "../db/schema/ledger.ts";
import {
  addEntry,
  createAccount,
  entriesCsv,
  getAccount,
  listBalances,
  periodSummary,
  reverseEntry,
  updateAccount,
  type Refusal,
} from "../services/ledger.ts";
import { procedure, router } from "../trpc.ts";

const idSchema = createSelectSchema(ledgerAccounts).pick({ id: true });

const found = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new TRPCError({ code: "NOT_FOUND", message });
  return value;
};

const refusals: Readonly<Record<Refusal, string>> = {
  "below floor": "That would take the stock below its floor. Reload to see the current balance.",
  "not reversible":
    "That entry is a reversal or has already been reversed. Record a new entry instead.",
};

const accepted = <T extends object>(value: T | Refusal | undefined, message: string): T => {
  if (typeof value === "string")
    throw new TRPCError({ code: "CONFLICT", message: refusals[value] });
  return found(value, message);
};

const noItem = "No stock item has that id";

export const stockRouter = router({
  balances: procedure.query(({ ctx }) => listBalances(ctx.db)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) => found(await getAccount(ctx.db, input.id), noItem)),
  createAccount: procedure
    .input(newAccountSchema)
    .mutation(({ ctx, input }) => createAccount(ctx.db, input)),
  updateAccount: procedure
    .input(accountUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateAccount(ctx.db, input), noItem)),
  addEntry: procedure
    .input(newEntrySchema)
    .mutation(async ({ ctx, input }) => accepted(await addEntry(ctx.db, input), noItem)),
  reverse: procedure
    .input(reversalSchema)
    .mutation(async ({ ctx, input }) =>
      accepted(await reverseEntry(ctx.db, input), "No entry has that id")
    ),
  summary: procedure.input(periodSchema).query(({ ctx, input }) => periodSummary(ctx.db, input)),
  exportCsv: procedure.input(periodSchema).query(({ ctx, input }) => entriesCsv(ctx.db, input)),
});
