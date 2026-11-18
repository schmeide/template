import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { files } from "./files.ts";

// Archiving is separate (archived_at), so a restored record keeps the status it had.
export const recordStatus = pgEnum("registry_status", [
  "in_use",
  "in_storage",
  "in_repair",
  "lost",
]);

// Names are unique ignoring case, so a CSV import can match them ignoring case.
export const registryCategories = pgTable(
  "registry_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
  },
  (table) => [uniqueIndex("registry_categories_name_key").on(sql`lower(${table.name})`)]
);

export const registryRecords = pgTable(
  "registry_records",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    // An asset tag or serial number.
    tag: varchar("tag", { length: 100 }).notNull().default(""),
    categoryId: integer("category_id").references(() => registryCategories.id),
    status: recordStatus("status").notNull().default("in_use"),
    // ponytail: free text because there is no users table; point it at users once sign-in exists.
    owner: varchar("owner", { length: 100 }).notNull().default(""),
    // A calendar day such as a warranty or license end. Null means it does not expire.
    expiresOn: date("expires_on"),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One per sort, each ending in id so paging is stable, plus the two filters.
  (table) => [
    index().on(table.name, table.id),
    index().on(table.expiresOn, table.id),
    index().on(table.createdAt, table.id),
    index().on(table.categoryId),
    index().on(table.status),
  ]
);

// Files attached to a record. A file is served only through this link, and removing one deletes
// the file, which removes the link. Archiving a record leaves its files in place.
export const registryAttachments = pgTable(
  "registry_attachments",
  {
    fileId: integer("file_id")
      .primaryKey()
      .references(() => files.id, { onDelete: "cascade" }),
    recordId: integer("record_id")
      .notNull()
      .references(() => registryRecords.id),
  },
  (table) => [index().on(table.recordId)]
);

export const fileIdSchema = createSelectSchema(registryAttachments).pick({ fileId: true });

export const newCategorySchema = createInsertSchema(registryCategories, {
  name: (schema) => schema.trim().min(1),
}).pick({ name: true });

// Create, edit and CSV import all validate a record with this schema.
export const newRecordSchema = createInsertSchema(registryRecords, {
  name: (schema) => schema.trim().min(1, "Enter a name"),
  tag: (schema) => schema.trim().optional(),
  owner: (schema) => schema.trim().optional(),
  expiresOn: () => z.iso.date().nullable().optional(),
}).pick({
  name: true,
  tag: true,
  categoryId: true,
  status: true,
  owner: true,
  expiresOn: true,
  notes: true,
});

export const idSchema = createSelectSchema(registryRecords).pick({ id: true });

export const recordUpdateSchema = newRecordSchema.extend(idSchema.shape);

export const sorts = ["name", "expiresOn", "createdAt"] as const;

// What the list shows, without paging; export takes the same object. No status means every
// record that is not archived; "archived" means only archived ones, whatever their status.
export const filterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  categoryId: z.number().int().optional(),
  status: z.enum([...recordStatus.enumValues, "archived"]).optional(),
  // Records whose date is on or before `today` plus `days`: already expired, or due within the
  // window. `today` is the viewer's calendar day, sent by the browser.
  expiring: z.object({ today: z.iso.date(), days: z.number().int().min(0).max(3650) }).optional(),
  sort: z.enum(sorts).optional(),
  descending: z.boolean().optional(),
});

export const pageSchema = filterSchema.extend({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

// ponytail: the request carries the whole file, so it must fit Fastify's 1 MiB body limit for
// tRPC (a character is at most 3 bytes in UTF-8). Upload the file instead of its text, through
// the `files` building block, to raise it.
export const importLimits = { characters: 300_000, rows: 5_000 } as const;

export const importSchema = z.object({ csv: z.string().max(importLimits.characters) });

export type Category = typeof registryCategories.$inferSelect;
export type RegistryRecord = typeof registryRecords.$inferSelect;
export type NewRecord = z.input<typeof newRecordSchema>;
export type RecordUpdate = z.input<typeof recordUpdateSchema>;
export type Filter = z.input<typeof filterSchema>;
export type PageRequest = z.input<typeof pageSchema>;
