import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

// Tables are the single source: validation and API types derive from them.
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  body: varchar("body", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// varchar(500) already yields max(500); trim and require at least one character.
export const newNoteSchema = createInsertSchema(notes, {
  body: (schema) => schema.trim().min(1),
}).pick({ body: true });

export type Note = typeof notes.$inferSelect;
export type NewNote = z.infer<typeof newNoteSchema>;
