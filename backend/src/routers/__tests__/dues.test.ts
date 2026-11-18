import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const code = (value: TRPCError["code"]) => ({ code: value }) satisfies Partial<TRPCError>;

describe("dues router", () => {
  it("bills a period, links both ways and refuses a second bill", async () => {
    const level = await caller.membership.createLevel({
      name: randomUUID(),
      fee: 4000,
      months: 12,
    });
    const customer = await caller.customers.create({ name: randomUUID() });
    const period = await caller.membership.addPeriod({
      customerId: customer.id,
      levelId: level.id,
      latestPeriodId: null,
    });

    const invoice = await caller.dues.bill({ periodId: period.id });

    expect(invoice).toMatchObject({ customerId: customer.id, status: "draft" });
    expect(await caller.dues.forPeriod({ id: period.id })).toMatchObject({
      state: "billed",
      invoice: { id: invoice.id },
    });
    expect(await caller.dues.forInvoice({ id: invoice.id })).toMatchObject({ id: period.id });
    await expect(caller.dues.bill({ periodId: period.id })).rejects.toMatchObject(code("CONFLICT"));
  });

  it("answers a missing period with NOT_FOUND and an invoice with no period with null", async () => {
    await expect(caller.dues.bill({ periodId: -1 })).rejects.toMatchObject(code("NOT_FOUND"));
    expect(await caller.dues.forInvoice({ id: -1 })).toBeNull();
  });
});
