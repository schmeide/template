import { date, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { newPersonSchema, people } from "./people.ts";

// A person's directory details. The person is the `people` name, so the directory is the same
// list as "Acting as"; one entry per person, made by the first save of their details.
// ponytail: no salary, bank, address or health fields, since every visitor sees every entry until
// platform sign-in can restrict them (schmeide/schmeide.app#84).
export const directoryEntries = pgTable("directory_entries", {
  personId: integer("person_id")
    .notNull()
    .unique()
    .references(() => people.id),
  email: varchar("email", { length: 200 }).notNull().default(""),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  jobTitle: varchar("job_title", { length: 100 }).notNull().default(""),
  team: varchar("team", { length: 100 }).notNull().default(""),
  // Calendar days. A leaving date before today makes the person former staff.
  startsOn: date("starts_on"),
  leavesOn: date("leaves_on"),
  notes: varchar("notes", { length: 2000 }).notNull().default(""),
});

// Every field but the person is optional.
export const saveEntrySchema = createInsertSchema(directoryEntries, {
  email: (schema) =>
    schema
      .trim()
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "Enter an email address such as ana@example.com",
      })
      .optional(),
  phone: (schema) => schema.trim().optional(),
  jobTitle: (schema) => schema.trim().optional(),
  team: (schema) => schema.trim().optional(),
  startsOn: () => z.iso.date().nullable().optional(),
  leavesOn: () => z.iso.date().nullable().optional(),
  notes: (schema) => schema.trim().optional(),
});

export const entrySchema = saveEntrySchema.omit({ personId: true });

export const personIdSchema = saveEntrySchema.pick({ personId: true });

// A new person: their name, added to `people`, and their details.
export const newStaffSchema = entrySchema.extend(newPersonSchema.shape);

// "today" is the viewer's calendar day, sent by the browser.
export const staffFilterSchema = z.object({
  today: z.iso.date(),
  search: z.string().trim().max(200).optional(),
  team: z.string().trim().max(100).optional(),
  former: z.boolean().optional(),
});

export type DirectoryEntry = typeof directoryEntries.$inferSelect;
export type SaveEntry = z.input<typeof saveEntrySchema>;
export type NewStaff = z.input<typeof newStaffSchema>;
export type StaffFilter = z.input<typeof staffFilterSchema>;
