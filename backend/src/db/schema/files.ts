import { customType, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Uint8Array rather than Buffer, so the frontend's typecheck of the API types needs no Node types.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

// Uploaded files. A shape that takes uploads links its rows here from a table of its own, and
// serves a file only through that link.
// ponytail: the bytes live in Postgres, at most `fileLimits.bytes` each, so they need no volume
// or setting and go wherever the database goes. That suits a few gigabytes in all; past that,
// backups and restores get slow. Move `bytes` to object storage (an S3-compatible bucket, keyed by
// id) then, and keep this table for the name, type and size.
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The types a file may have, each with the word the error message uses, and the largest size.
// Nothing a browser would run (HTML, SVG) is allowed, and downloads are served as attachments.
export const fileLimits = {
  bytes: 10 * 1024 * 1024,
  types: {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/heic": "HEIC",
    "text/plain": "text",
    "text/csv": "CSV",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  },
} as const;

export const fileNameSchema = createInsertSchema(files, {
  name: (schema) => schema.trim().min(1),
}).shape.name;

// Every column but the bytes: what a list of files shows.
export const fileColumns = {
  id: files.id,
  name: files.name,
  type: files.type,
  size: files.size,
  createdAt: files.createdAt,
};

export type StoredFile = Omit<typeof files.$inferSelect, "bytes">;
export type Upload = { readonly name: string; readonly type: string; readonly bytes: Uint8Array };
