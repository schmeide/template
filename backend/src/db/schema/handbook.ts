import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { people } from "./people.ts";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// A page of written knowledge. Pages sit in a section (free text, "" for none), in `position`
// order within it. `version` goes up with every change to the title or body; a read is of one
// version.
export const handbookPages = pgTable(
  "handbook_pages",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    // Markdown. The cap keeps a save well inside the 1 MiB request limit.
    body: varchar("body", { length: 100_000 }).notNull().default(""),
    section: varchar("section", { length: 100 }).notNull().default(""),
    position: integer("position").notNull(),
    // Whether people are asked to confirm they have read it, as for a policy.
    trackReads: boolean("track_reads").notNull().default(false),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Null for the pages a new project starts with.
    updatedById: integer("updated_by_id").references(() => people.id),
    // Title words weigh more than body words in search ranking.
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`setweight(to_tsvector('english', ${handbookPages.title}), 'A') || setweight(to_tsvector('english', ${handbookPages.body}), 'B')`
      ),
  },
  (table) => [
    index().on(table.section, table.position),
    index("handbook_pages_search_index").using("gin", table.search),
  ]
);

// Who confirmed reading which version of a page; one row per page and person, the latest read.
export const handbookReads = pgTable(
  "handbook_reads",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => handbookPages.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    version: integer("version").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.pageId, table.personId] })]
);

const actorShape = { actorId: z.number().int() };
const idShape = createSelectSchema(handbookPages).pick({ id: true, version: true }).shape;

export const newPageSchema = createInsertSchema(handbookPages, {
  title: (schema) => schema.trim().min(1),
  section: (schema) => schema.trim().optional(),
})
  .pick({ title: true, body: true, section: true, trackReads: true })
  .extend(actorShape);

// `version` is the one the editor started from; a page changed since then is not overwritten.
export const pageUpdateSchema = newPageSchema.extend(idShape);

export const moveSchema = z.object({ id: idShape.id, direction: z.enum(["up", "down"]) });
export const searchSchema = z.object({ query: z.string().max(200) });
export const readSchema = z.object({ ...idShape, ...actorShape });

// The search vector stays in the database.
export type Page = Omit<typeof handbookPages.$inferSelect, "search">;
export type NewPage = z.input<typeof newPageSchema>;
export type PageUpdate = z.input<typeof pageUpdateSchema>;
export type Read = z.input<typeof readSchema>;
