import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers.ts";

// A stage that closes an item says how: won or lost. Open stages have no outcome.
export const stageOutcome = pgEnum("pipeline_stage_outcome", ["won", "lost"]);
export const activityKind = pgEnum("pipeline_activity_kind", ["note", "stage"]);

// Positions are dense (0, 1, 2, ...) and only change inside a transaction that holds the
// affected stage rows locked, so concurrent moves cannot leave gaps or duplicates.
export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  position: integer("position").notNull(),
  outcome: stageOutcome("outcome"),
});

export const pipelineItems = pgTable(
  "pipeline_items",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    stageId: integer("stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    position: integer("position").notNull(),
    // ponytail: free text because there is no users table; point it at users once sign-in exists.
    owner: varchar("owner", { length: 100 }).notNull().default(""),
    // ponytail: whole units of one currency; move to minor units and a currency column, sharing
    // the money building block, when a project needs cents or several currencies.
    value: integer("value"),
    dueDate: date("due_date"),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.stageId, table.position),
    check("pipeline_items_value_not_negative", sql`${table.value} >= 0`),
  ]
);

export const pipelineActivity = pgTable("pipeline_activity", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => pipelineItems.id, { onDelete: "cascade" }),
  kind: activityKind("kind").notNull(),
  text: varchar("text", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const idShape = createSelectSchema(pipelineItems).pick({ id: true }).shape;

export const newStageSchema = createInsertSchema(pipelineStages, {
  name: (schema) => schema.trim().min(1),
}).pick({ name: true, outcome: true });

export const stageUpdateSchema = newStageSchema.extend(
  createSelectSchema(pipelineStages).pick({ id: true }).shape
);

// A refined column loses its optionality, so restore it for the optional fields.
const itemFields = createInsertSchema(pipelineItems, {
  title: (schema) => schema.trim().min(1),
  value: (schema) => schema.min(0).nullable().optional(),
  dueDate: () => z.iso.date().nullable().optional(),
}).pick({ title: true, owner: true, value: true, dueDate: true, customerId: true });

export const newItemSchema = itemFields.extend(
  createInsertSchema(pipelineItems).pick({ stageId: true }).shape
);
export const itemUpdateSchema = itemFields.extend(idShape);

// Where to put an item: a stage and an index in it. An index past the end means the end.
export const moveSchema = z.object({
  ...idShape,
  stageId: z.number().int(),
  position: z.number().int().min(0),
});

export const newNoteSchema = createInsertSchema(pipelineActivity, {
  text: (schema) => schema.trim().min(1),
}).pick({ itemId: true, text: true });

export type Stage = typeof pipelineStages.$inferSelect;
export type Item = typeof pipelineItems.$inferSelect;
export type Activity = typeof pipelineActivity.$inferSelect;
export type NewStage = z.input<typeof newStageSchema>;
export type StageUpdate = z.input<typeof stageUpdateSchema>;
export type NewItem = z.input<typeof newItemSchema>;
export type ItemUpdate = z.input<typeof itemUpdateSchema>;
export type Move = z.input<typeof moveSchema>;
export type NewNote = z.input<typeof newNoteSchema>;
