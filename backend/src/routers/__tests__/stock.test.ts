import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const conflict = { code: "CONFLICT" } satisfies Partial<TRPCError>;

describe("stock router", () => {
  it("creates an item, records stock, reverses an entry and reads the balance", async () => {
    const name = randomUUID();
    const item = await caller.stock.createAccount({ name: `  ${name}  `, unit: "pcs" });
    const received = await caller.stock.addEntry({
      accountId: item.id,
      kind: "in",
      quantity: 5,
      entryDate: "2026-06-01",
      who: "Sam",
    });
    await caller.stock.addEntry({
      accountId: item.id,
      kind: "out",
      quantity: -2,
      entryDate: "2026-06-02",
    });

    expect(item.name).toBe(name);
    expect((await caller.stock.get({ id: item.id })).balance).toBe(3);
    await expect(
      caller.stock.reverse({ entryId: received.id, entryDate: "2026-06-03" })
    ).rejects.toMatchObject(conflict);
    const listed = (await caller.stock.balances()).find((row) => row.id === item.id);
    expect(listed?.balance).toBe(3);
  });

  it("reports a withdrawal past the floor and a second reversal as conflicts", async () => {
    const item = await caller.stock.createAccount({ name: randomUUID() });
    const received = await caller.stock.addEntry({
      accountId: item.id,
      kind: "in",
      quantity: 1,
      entryDate: "2026-06-01",
    });

    await expect(
      caller.stock.addEntry({
        accountId: item.id,
        kind: "out",
        quantity: -2,
        entryDate: "2026-06-01",
      })
    ).rejects.toMatchObject(conflict);
    await caller.stock.reverse({ entryId: received.id, entryDate: "2026-06-01" });
    await expect(
      caller.stock.reverse({ entryId: received.id, entryDate: "2026-06-01" })
    ).rejects.toMatchObject(conflict);
  });

  it("summarizes and exports a period", async () => {
    const item = await caller.stock.createAccount({ name: randomUUID() });
    await caller.stock.addEntry({
      accountId: item.id,
      kind: "in",
      quantity: 4,
      entryDate: "2026-07-01",
    });

    const summary = await caller.stock.summary({ from: "2026-07-01", to: "2026-07-01" });
    const csv = await caller.stock.exportCsv({ from: "2026-07-01", to: "2026-07-01" });

    expect(summary.find((row) => row.accountId === item.id)).toMatchObject({ quantity: 4 });
    expect(csv).toContain(item.name);
  });

  it.each([
    ["a blank name", () => caller.stock.createAccount({ name: " " })],
    [
      "a zero quantity",
      () =>
        caller.stock.addEntry({
          accountId: 1,
          kind: "adjust",
          quantity: 0,
          entryDate: "2026-06-01",
        }),
    ],
    [
      "a fractional quantity",
      () =>
        caller.stock.addEntry({ accountId: 1, kind: "in", quantity: 1.5, entryDate: "2026-06-01" }),
    ],
    [
      "an out entry that adds",
      () =>
        caller.stock.addEntry({ accountId: 1, kind: "out", quantity: 1, entryDate: "2026-06-01" }),
    ],
    [
      "a malformed date",
      () => caller.stock.addEntry({ accountId: 1, kind: "in", quantity: 1, entryDate: "soon" }),
    ],
    [
      "a period that ends first",
      () => caller.stock.summary({ from: "2026-02-01", to: "2026-01-01" }),
    ],
  ])("rejects %s", async (_label, call) => {
    await expect(call()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it.each([
    ["get", () => caller.stock.get({ id: -1 })],
    ["updateAccount", () => caller.stock.updateAccount({ id: -1, name: "x" })],
    [
      "addEntry",
      () =>
        caller.stock.addEntry({ accountId: -1, kind: "in", quantity: 1, entryDate: "2026-06-01" }),
    ],
    ["reverse", () => caller.stock.reverse({ entryId: -1, entryDate: "2026-06-01" })],
  ])("reports a missing row in %s as not found", async (_label, call) => {
    await expect(call()).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });
});
