import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const code = (value: TRPCError["code"]) => ({ code: value }) satisfies Partial<TRPCError>;

describe("membership router", () => {
  it("adds a level, joins a member, lists them and refuses a second join", async () => {
    const level = await caller.membership.createLevel({
      name: `  ${randomUUID()}  `,
      fee: 5000,
      months: 12,
    });
    const customer = await caller.customers.create({ name: randomUUID() });
    const join = { customerId: customer.id, levelId: level.id, latestPeriodId: null };

    const period = await caller.membership.addPeriod(join);

    expect(level.name).not.toMatch(/^\s|\s$/);
    expect(period).toMatchObject({ levelName: level.name, fee: 5000 });
    expect(await caller.membership.member({ customerId: customer.id })).toMatchObject({
      status: "current",
      periods: [{ id: period.id }],
    });
    expect(
      (await caller.membership.members()).find(({ customerId }) => customerId === customer.id)
    ).toMatchObject({ status: "current", levelName: level.name, latestPeriodId: period.id });
    await expect(caller.membership.addPeriod(join)).rejects.toMatchObject(code("CONFLICT"));
  });

  it("validates levels and answers missing records with NOT_FOUND", async () => {
    await expect(
      caller.membership.createLevel({ name: " ", fee: 0, months: null })
    ).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(
      caller.membership.createLevel({ name: "Adult", fee: -1, months: 12 })
    ).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(
      caller.membership.createLevel({ name: "Adult", fee: 0, months: 0 })
    ).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(caller.membership.retireLevel({ id: -1 })).rejects.toMatchObject(
      code("NOT_FOUND")
    );
    await expect(caller.membership.member({ customerId: -1 })).rejects.toMatchObject(
      code("NOT_FOUND")
    );
    await expect(
      caller.membership.addPeriod({ customerId: -1, levelId: -1, latestPeriodId: null })
    ).rejects.toMatchObject(code("NOT_FOUND"));
  });
});
