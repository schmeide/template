import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { createCustomer } from "../customers.ts";
import {
  addNote,
  addStage,
  createItem,
  getBoard,
  getItem,
  moveItem,
  moveStage,
  updateItem,
  updateStage,
} from "../pipeline.ts";

// Tests share one database, so they create their own stages and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newStage = (outcome?: "won" | "lost") => addStage(db, { name: randomUUID(), outcome });

const titlesIn = async (stageId: number) => {
  const board = await getBoard(db);
  return board.find((stage) => stage.id === stageId)?.items.map((item) => item.title);
};

const positionsIn = async (stageId: number) => {
  const board = await getBoard(db);
  return board.find((stage) => stage.id === stageId)?.items.map((item) => item.position);
};

const newItems = async (stageId: number, titles: readonly string[]) => {
  const items = [];
  for (const title of titles) {
    const item = await createItem(db, { title, stageId });
    if (!item) throw new Error("The stage is missing");
    items.push(item);
  }
  return items;
};

describe("pipeline service", () => {
  it("adds stages at the end and reorders them", async () => {
    const a = await newStage();
    const b = await newStage();
    const c = await newStage("won");

    await moveStage(db, c.id, a.position);

    const ids = (await getBoard(db)).map((stage) => stage.id);
    expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    const positions = (await getBoard(db)).map((stage) => stage.position);
    expect(positions).toEqual(positions.map((_, index) => index));
  });

  it("renames a stage and sets its outcome", async () => {
    const stage = await newStage();

    const updated = await updateStage(db, { id: stage.id, name: "Closed", outcome: "lost" });

    expect(updated).toMatchObject({ id: stage.id, name: "Closed", outcome: "lost" });
    expect(await updateStage(db, { id: -1, name: "Nope" })).toBeUndefined();
  });

  it("creates items at the end of their stage with optional fields empty", async () => {
    const stage = await newStage();
    const customer = await createCustomer(db, { name: randomUUID() });

    const first = await createItem(db, { title: "First", stageId: stage.id });
    const second = await createItem(db, {
      title: "Second",
      stageId: stage.id,
      owner: "Sam",
      value: 5000,
      dueDate: "2026-12-01",
      customerId: customer.id,
    });

    expect(first).toMatchObject({ position: 0, owner: "", value: null, dueDate: null });
    expect(second).toMatchObject({ position: 1, owner: "Sam", value: 5000 });
    expect(await createItem(db, { title: "Lost", stageId: -1 })).toBeUndefined();
  });

  it("totals value and counts items per stage", async () => {
    const stage = await newStage();
    await createItem(db, { title: "A", stageId: stage.id, value: 1000 });
    await createItem(db, { title: "B", stageId: stage.id, value: 250 });
    await createItem(db, { title: "C", stageId: stage.id });

    const summary = (await getBoard(db)).find((candidate) => candidate.id === stage.id);

    expect(summary).toMatchObject({ count: 3, total: 1250 });
  });

  it("reorders an item within its stage without an activity row", async () => {
    const stage = await newStage();
    const [a] = await newItems(stage.id, ["a", "b", "c", "d"]);

    await moveItem(db, { id: a.id, stageId: stage.id, position: 2 });

    expect(await titlesIn(stage.id)).toEqual(["b", "c", "a", "d"]);
    expect(await positionsIn(stage.id)).toEqual([0, 1, 2, 3]);
    expect((await getItem(db, a.id))?.activity).toEqual([]);

    const d = (await getBoard(db)).find((s) => s.id === stage.id)?.items[3];
    await moveItem(db, { id: d?.id ?? -1, stageId: stage.id, position: 0 });
    expect(await titlesIn(stage.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("moves an item to another stage and records the change", async () => {
    const from = await newStage();
    const to = await newStage();
    const [a] = await newItems(from.id, ["a", "b"]);
    await newItems(to.id, ["x", "y"]);

    const moved = await moveItem(db, { id: a.id, stageId: to.id, position: 1 });

    expect(moved).toMatchObject({ stageId: to.id, position: 1 });
    expect(await titlesIn(from.id)).toEqual(["b"]);
    expect(await positionsIn(from.id)).toEqual([0]);
    expect(await titlesIn(to.id)).toEqual(["x", "a", "y"]);
    expect(await positionsIn(to.id)).toEqual([0, 1, 2]);
    const item = await getItem(db, a.id);
    expect(item?.activity).toMatchObject([
      { kind: "stage", text: `Moved from ${from.name} to ${to.name}` },
    ]);
  });

  it("puts an item at the end when the position is past it", async () => {
    const from = await newStage();
    const to = await newStage();
    const [a] = await newItems(from.id, ["a"]);
    await newItems(to.id, ["x"]);

    await moveItem(db, { id: a.id, stageId: to.id, position: 99 });

    expect(await titlesIn(to.id)).toEqual(["x", "a"]);
  });

  it("refuses a move to a missing stage or of a missing item", async () => {
    const stage = await newStage();
    const [a] = await newItems(stage.id, ["a"]);

    await expect(moveItem(db, { id: a.id, stageId: -1, position: 0 })).resolves.toBeUndefined();
    await expect(moveItem(db, { id: -1, stageId: stage.id, position: 0 })).resolves.toBeUndefined();
    expect(await titlesIn(stage.id)).toEqual(["a"]);
  });

  it("keeps positions dense when many moves run at once", async () => {
    const left = await newStage();
    const right = await newStage();
    const items = await newItems(left.id, ["a", "b", "c", "d", "e", "f"]);

    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        moveItem(db, {
          id: items[index % items.length].id,
          stageId: index % 3 === 0 ? left.id : right.id,
          position: (index * 7) % 5,
        })
      )
    );

    const leftPositions = (await positionsIn(left.id)) ?? [];
    const rightPositions = (await positionsIn(right.id)) ?? [];
    expect(leftPositions).toEqual(leftPositions.map((_, index) => index));
    expect(rightPositions).toEqual(rightPositions.map((_, index) => index));
    expect(leftPositions.length + rightPositions.length).toBe(items.length);
  });

  it("gives items created at once distinct positions", async () => {
    const stage = await newStage();

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createItem(db, { title: String(index), stageId: stage.id })
      )
    );

    expect(await positionsIn(stage.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("updates an item's fields without changing its stage", async () => {
    const stage = await newStage();
    const customer = await createCustomer(db, { name: randomUUID() });
    const [a] = await newItems(stage.id, ["a"]);

    const updated = await updateItem(db, {
      id: a.id,
      title: "Renamed",
      owner: "Ana",
      value: 900,
      dueDate: "2026-12-24",
      customerId: customer.id,
    });

    expect(updated).toMatchObject({ title: "Renamed", stageId: stage.id, position: 0 });
    expect(await getItem(db, a.id)).toMatchObject({
      owner: "Ana",
      value: 900,
      stage: { id: stage.id },
      customer: { id: customer.id, name: customer.name },
    });
    expect(await updateItem(db, { id: -1, title: "x" })).toBeUndefined();
  });

  it("adds notes to the timeline, newest first", async () => {
    const from = await newStage();
    const to = await newStage();
    const [a] = await newItems(from.id, ["a"]);

    await addNote(db, { itemId: a.id, text: "Called them" });
    await moveItem(db, { id: a.id, stageId: to.id, position: 0 });

    const item = await getItem(db, a.id);
    expect(item?.activity.map((entry) => entry.kind)).toEqual(["stage", "note"]);
    expect(item?.activity[1].text).toBe("Called them");
    expect(await addNote(db, { itemId: -1, text: "x" })).toBeUndefined();
  });
});
