import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

// The names people pick to say who they are. The table keeps the name it had when the requests
// shape owned it: renaming it would drop and recreate it.
// ponytail: a plain list of names picked in the browser ("acting as"), so anyone can act as anyone.
// Replace it with the signed-in user once the platform supplies sign-in (schmeide/schmeide.app#84).
export const people = pgTable("approval_people", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const newPersonSchema = createInsertSchema(people, {
  name: (schema) => schema.trim().min(1),
}).pick({ name: true });

export type Person = typeof people.$inferSelect;
export type NewPerson = z.input<typeof newPersonSchema>;
