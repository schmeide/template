import { exportSchema, rangeSchema } from "../db/schema/dashboard.ts";
import {
  breakdownCsv,
  listCategories,
  revenueByCategory,
  revenueSeries,
  salesTotals,
  seriesCsv,
} from "../services/dashboard.ts";
import { procedure, router } from "../trpc.ts";

const csvOf = { series: seriesCsv, breakdown: breakdownCsv } as const;

export const dashboardRouter = router({
  categories: procedure.query(({ ctx }) => listCategories(ctx.db)),
  totals: procedure.input(rangeSchema).query(({ ctx, input }) => salesTotals(ctx.db, input)),
  series: procedure.input(rangeSchema).query(({ ctx, input }) => revenueSeries(ctx.db, input)),
  breakdown: procedure
    .input(rangeSchema)
    .query(({ ctx, input }) => revenueByCategory(ctx.db, input)),
  exportCsv: procedure
    .input(exportSchema)
    .query(({ ctx, input: { table, ...range } }) => csvOf[table](ctx.db, range)),
});
