import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("deals router", () => {
  it("adds a stage, creates a deal, moves it and notes on it", async () => {
    const from = await caller.deals.addStage({ name: `  ${randomUUID()}  ` });
    const to = await caller.deals.addStage({ name: randomUUID(), outcome: "won" });

    const deal = await caller.deals.create({ title: "  Big deal  ", stageId: from.id, value: 500 });
    await caller.deals.move({ id: deal.id, stageId: to.id, position: 0 });
    await caller.deals.addNote({ itemId: deal.id, text: "  Signed  " });

    expect(from.name).not.toMatch(/^\s|\s$/);
    expect(deal.title).toBe("Big deal");
    const board = await caller.deals.board();
    expect(board.find((stage) => stage.id === to.id)).toMatchObject({ count: 1, total: 500 });
    const detail = await caller.deals.get({ id: deal.id });
    expect(detail.stage.id).toBe(to.id);
    expect(detail.activity.map((entry) => entry.text)).toEqual([
      "Signed",
      `Moved from ${from.name} to ${to.name}`,
    ]);
  });

  it("renames and reorders stages", async () => {
    const stage = await caller.deals.addStage({ name: randomUUID() });

    const renamed = await caller.deals.updateStage({ id: stage.id, name: "Demo" });
    const moved = await caller.deals.moveStage({ id: stage.id, position: 0 });

    expect(renamed.name).toBe("Demo");
    expect(moved.position).toBe(0);
  });

  it.each([
    ["a blank title", { title: "  ", stageId: 1 }],
    ["a negative value", { title: "x", stageId: 1, value: -1 }],
    ["a malformed due date", { title: "x", stageId: 1, dueDate: "soon" }],
  ])("rejects %s", async (_label, input) => {
    await expect(caller.deals.create(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it("rejects a blank note", async () => {
    await expect(caller.deals.addNote({ itemId: 1, text: " " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });

  it.each([
    ["get", () => caller.deals.get({ id: -1 })],
    ["create", () => caller.deals.create({ title: "x", stageId: -1 })],
    ["update", () => caller.deals.update({ id: -1, title: "x" })],
    ["move", () => caller.deals.move({ id: -1, stageId: -1, position: 0 })],
    ["addNote", () => caller.deals.addNote({ itemId: -1, text: "x" })],
    ["updateStage", () => caller.deals.updateStage({ id: -1, name: "x" })],
    ["moveStage", () => caller.deals.moveStage({ id: -1, position: 0 })],
  ])("reports a missing row in %s as not found", async (_label, call) => {
    await expect(call()).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });
});
