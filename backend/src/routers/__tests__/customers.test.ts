import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("customers router", () => {
  it("creates, lists, gets and updates a customer", async () => {
    const name = randomUUID();

    const created = await caller.customers.create({ name: `  ${name}  ` });
    const listed = await caller.customers.list();
    const updated = await caller.customers.update({ ...created, phone: "555 0100" });

    expect(created.name).toBe(name);
    expect(listed.map((customer) => customer.id)).toContain(created.id);
    expect(await caller.customers.get({ id: created.id })).toEqual(updated);
  });

  it.each([
    ["a blank name", { name: "  " }],
    ["a name over 200 characters", { name: "x".repeat(201) }],
  ])("rejects %s", async (_label, input) => {
    await expect(caller.customers.create(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("reports a missing customer as not found", async () => {
    await expect(caller.customers.get({ id: -1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });
});
