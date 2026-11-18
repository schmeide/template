import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { dashboardSales } from "../../db/schema/dashboard.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("dashboard router", () => {
  it("serves each metric for a range and a category", async () => {
    const category = randomUUID();
    await db.insert(dashboardSales).values({ soldOn: "2025-04-10", amount: 300, category });
    const range = { from: "2025-04-01", to: "2025-04-30", category };

    expect(await caller.dashboard.totals(range)).toEqual({ revenue: 300, sales: 1, average: 300 });
    expect((await caller.dashboard.series(range)).points).toHaveLength(30);
    expect(await caller.dashboard.breakdown(range)).toEqual([{ category, revenue: 300, sales: 1 }]);
    expect(await caller.dashboard.exportCsv({ ...range, table: "breakdown" })).toContain(category);
    expect(await caller.dashboard.categories()).toContain(category);
  });

  it("refuses a range that ends before it starts", async () => {
    await expect(
      caller.dashboard.totals({ from: "2025-04-02", to: "2025-04-01" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });
});
