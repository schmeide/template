import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema/customers.ts";
import {
  pipelineActivity,
  pipelineItems,
  pipelineStages,
  type Activity,
  type Item,
  type ItemUpdate,
  type Move,
  type NewItem,
  type NewNote,
  type NewStage,
  type Stage,
  type StageUpdate,
} from "../db/schema/pipeline.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What a new project starts with: a sales pipeline. Edit for the project.
const defaultStages: readonly NewStage[] = [
  { name: "Lead" },
  { name: "Qualified" },
  { name: "Proposal" },
  { name: "Negotiation" },
  { name: "Won", outcome: "won" },
  { name: "Lost", outcome: "lost" },
];

// Stage changes (add, reorder, seed) are rare, so they lock the whole stages table. That also
// waits for item moves, which hold stage rows locked, and makes them wait in turn.
const lockStages = (tx: Tx) => tx.execute(sql`lock table ${pipelineStages} in exclusive mode`);

const itemsIn = async (tx: Tx, stageId: number, except = -1) => {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(pipelineItems)
    .where(and(eq(pipelineItems.stageId, stageId), ne(pipelineItems.id, except)));
  return total;
};

const seedStages = (db: Db) =>
  db.transaction(async (tx) => {
    await lockStages(tx);
    const [{ total }] = await tx.select({ total: count() }).from(pipelineStages);
    if (total > 0) return;
    await tx
      .insert(pipelineStages)
      .values(defaultStages.map((stage, position) => ({ ...stage, position })));
  });

export const addStage = (db: Db, input: Readonly<NewStage>): Promise<Stage> =>
  db.transaction(async (tx) => {
    await lockStages(tx);
    const [{ total }] = await tx.select({ total: count() }).from(pipelineStages);
    const [stage] = await tx
      .insert(pipelineStages)
      .values({ ...input, position: total })
      .returning();
    return stage;
  });

export const updateStage = async (
  db: Db,
  { id, ...input }: Readonly<StageUpdate>
): Promise<Stage | undefined> => {
  const [stage] = await db
    .update(pipelineStages)
    .set({ ...input, outcome: input.outcome ?? null })
    .where(eq(pipelineStages.id, id))
    .returning();
  return stage;
};

// Moves a stage to `position` (clamped to the end) and renumbers the rest.
export const moveStage = (db: Db, id: number, position: number): Promise<Stage | undefined> =>
  db.transaction(async (tx) => {
    await lockStages(tx);
    const stages = await tx.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
    const stage = stages.find((candidate) => candidate.id === id);
    if (!stage) return undefined;
    const rest = stages.filter((candidate) => candidate.id !== id);
    const at = Math.min(position, rest.length);
    const order = [...rest.slice(0, at), stage, ...rest.slice(at)];
    for (const [index, { id: stageId, position: current }] of order.entries()) {
      if (index !== current) {
        await tx
          .update(pipelineStages)
          .set({ position: index })
          .where(eq(pipelineStages.id, stageId));
      }
    }
    return { ...stage, position: order.indexOf(stage) };
  });

// Appends to the stage. Locking the stage row queues concurrent creates for the next position.
export const createItem = (db: Db, input: Readonly<NewItem>): Promise<Item | undefined> =>
  db.transaction(async (tx) => {
    const [stage] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.id, input.stageId))
      .for("update");
    if (!stage) return undefined;
    const [item] = await tx
      .insert(pipelineItems)
      .values({ ...input, position: await itemsIn(tx, stage.id) })
      .returning();
    return item;
  });

// Changes an item's fields. Its stage and position change only through `moveItem`.
export const updateItem = async (
  db: Db,
  { id, ...input }: Readonly<ItemUpdate>
): Promise<Item | undefined> => {
  const [item] = await db
    .update(pipelineItems)
    .set({
      ...input,
      owner: input.owner ?? "",
      value: input.value ?? null,
      dueDate: input.dueDate ?? null,
      customerId: input.customerId ?? null,
    })
    .where(eq(pipelineItems.id, id))
    .returning();
  return item;
};

const findItem = async (tx: Tx, id: number) => {
  const [item] = await tx.select().from(pipelineItems).where(eq(pipelineItems.id, id));
  return item;
};

// Puts an item at `position` in `stageId` (clamped to the end) and closes the gap it left.
// Positions in a stage change only while its row is locked, so this locks the item's stage and
// the target stage, in id order so two moves cannot deadlock. If the item changed stage before
// the lock was granted, it tries again with the new one. A stage change writes an activity row in
// the same transaction.
export const moveItem = async (db: Db, move: Readonly<Move>): Promise<Item | undefined> => {
  const result = await db.transaction(async (tx) => {
    const seen = await findItem(tx, move.id);
    if (!seen) return undefined;
    const stages = await tx
      .select()
      .from(pipelineStages)
      .where(inArray(pipelineStages.id, [seen.stageId, move.stageId]))
      .orderBy(asc(pipelineStages.id))
      .for("update");
    const item = await findItem(tx, move.id);
    if (!item) return undefined;
    if (item.stageId !== seen.stageId) return "moved meanwhile";
    const { stageId, position } = move;
    const from = stages.find((stage) => stage.id === item.stageId);
    const to = stages.find((stage) => stage.id === stageId);
    if (!from || !to) return undefined;
    const target = Math.min(position, await itemsIn(tx, to.id, item.id));
    const inStage = (id: number) => eq(pipelineItems.stageId, id);
    const shift = (by: number) => ({ position: sql`${pipelineItems.position} + ${by}` });

    if (from.id === to.id) {
      if (target === item.position) return item;
      await tx
        .update(pipelineItems)
        .set(target > item.position ? shift(-1) : shift(1))
        .where(
          and(
            inStage(from.id),
            target > item.position
              ? and(gt(pipelineItems.position, item.position), lte(pipelineItems.position, target))
              : and(gte(pipelineItems.position, target), lt(pipelineItems.position, item.position))
          )
        );
    } else {
      await tx
        .update(pipelineItems)
        .set(shift(-1))
        .where(and(inStage(from.id), gt(pipelineItems.position, item.position)));
      await tx
        .update(pipelineItems)
        .set(shift(1))
        .where(and(inStage(to.id), gte(pipelineItems.position, target)));
      await tx.insert(pipelineActivity).values({
        itemId: item.id,
        kind: "stage",
        text: `Moved from ${from.name} to ${to.name}`,
      });
    }
    const [moved] = await tx
      .update(pipelineItems)
      .set({ stageId: to.id, position: target })
      .where(eq(pipelineItems.id, item.id))
      .returning();
    return moved;
  });
  return result === "moved meanwhile" ? moveItem(db, move) : result;
};

export const addNote = async (db: Db, input: Readonly<NewNote>): Promise<Activity | undefined> => {
  const [item] = await db
    .select({ id: pipelineItems.id })
    .from(pipelineItems)
    .where(eq(pipelineItems.id, input.itemId));
  if (!item) return undefined;
  const [note] = await db
    .insert(pipelineActivity)
    .values({ ...input, kind: "note" })
    .returning();
  return note;
};

// Every stage in order with its items, their count and their total value. A database with no
// stages gets the default ones first.
// ponytail: loads every item with no paging; page per stage when boards reach thousands.
export const getBoard = async (db: Db) => {
  const [{ total }] = await db.select({ total: count() }).from(pipelineStages);
  if (total === 0) await seedStages(db);
  const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
  const items = await db
    .select({
      id: pipelineItems.id,
      title: pipelineItems.title,
      stageId: pipelineItems.stageId,
      position: pipelineItems.position,
      owner: pipelineItems.owner,
      value: pipelineItems.value,
      dueDate: pipelineItems.dueDate,
      customerName: customers.name,
    })
    .from(pipelineItems)
    .leftJoin(customers, eq(pipelineItems.customerId, customers.id))
    .orderBy(asc(pipelineItems.position));
  return stages.map((stage) => {
    const own = items.filter((item) => item.stageId === stage.id);
    return {
      ...stage,
      items: own,
      count: own.length,
      total: own.reduce((sum, item) => sum + (item.value ?? 0), 0),
    };
  });
};

export const getItem = async (db: Db, id: number) => {
  const [row] = await db
    .select({ item: pipelineItems, stage: pipelineStages, customer: customers })
    .from(pipelineItems)
    .innerJoin(pipelineStages, eq(pipelineItems.stageId, pipelineStages.id))
    .leftJoin(customers, eq(pipelineItems.customerId, customers.id))
    .where(eq(pipelineItems.id, id));
  if (!row) return undefined;
  const activity = await db
    .select()
    .from(pipelineActivity)
    .where(eq(pipelineActivity.itemId, id))
    .orderBy(desc(pipelineActivity.createdAt), desc(pipelineActivity.id));
  return { ...row.item, stage: row.stage, customer: row.customer, activity };
};
