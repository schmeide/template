import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { people } from "./people.ts";

export const requestStatus = pgEnum("approval_request_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "returned",
  "withdrawn",
]);

// What a request type asks for. A `check` field is a pass or fail item with an optional note, so a
// type made of check fields is an inspection checklist.
export const fieldKinds = ["text", "number", "date", "choice", "check"] as const;

const label = z.string().trim().min(1).max(100);

export const fieldSchema = z
  .object({
    label,
    kind: z.enum(fieldKinds),
    required: z.boolean(),
    options: z.array(label).max(20).optional(),
  })
  .refine(
    (field) => field.kind !== "choice" || (field.options?.length ?? 0) >= 2,
    "A choice field needs at least two options"
  );

export const fieldsSchema = z
  .array(fieldSchema)
  .min(1, "Add at least one field")
  .max(50)
  .refine(
    (fields) => new Set(fields.map((field) => field.label)).size === fields.length,
    "Give each field a different label"
  );

export const checkResults = ["pass", "fail"] as const;
export const checkAnswerSchema = z.object({
  result: z.enum(checkResults),
  note: z.string().trim().max(500).optional(),
});

export type Field = z.infer<typeof fieldSchema>;
export type FieldKind = Field["kind"];
export type CheckAnswer = z.infer<typeof checkAnswerSchema>;
export type Answer = string | number | CheckAnswer;
// Keyed by field label. The fields they answer are copied onto the request.
export type Answers = Readonly<Record<string, Answer>>;

export const approvalTypes = pgTable("approval_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  fields: jsonb("fields").$type<readonly Field[]>().notNull(),
  // Who decides. No approver means anyone but the submitter.
  approverId: integer("approver_id").references(() => people.id, { onDelete: "set null" }),
  // The public intake link. Null while public intake is off; a random UUID is unguessable.
  publicToken: uuid("public_token").unique(),
});

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: serial("id").primaryKey(),
    typeId: integer("type_id")
      .notNull()
      .references(() => approvalTypes.id),
    // Null for a request that came through the public link; `contact` says who sent it.
    submitterId: integer("submitter_id").references(() => people.id),
    contact: varchar("contact", { length: 200 }).notNull().default(""),
    // The type's fields as they stood when the request was last saved, so it stays readable after
    // the type changes.
    fields: jsonb("fields").$type<readonly Field[]>().notNull(),
    answers: jsonb("answers").$type<Answers>().notNull(),
    status: requestStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    index().on(table.status),
    index().on(table.submitterId),
    check("approval_requests_who", sql`${table.submitterId} is not null or ${table.contact} <> ''`),
  ]
);

// Every status change, with who made it. Approve, reject and return are the reviewer's decisions;
// submit and withdraw are the submitter's.
export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    // Null for a submission through the public link.
    actorId: integer("actor_id").references(() => people.id),
    outcome: requestStatus("outcome").notNull(),
    comment: varchar("comment", { length: 2000 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.requestId)]
);

const idShape = createSelectSchema(approvalRequests).pick({ id: true }).shape;
const actorShape = { actorId: z.number().int() };
const answersSchema = z.record(z.string(), z.unknown());

export const newTypeSchema = createInsertSchema(approvalTypes, {
  name: (schema) => schema.trim().min(1),
  fields: () => fieldsSchema,
}).pick({ name: true, fields: true, approverId: true });
export const typeUpdateSchema = newTypeSchema.extend(
  createSelectSchema(approvalTypes).pick({ id: true }).shape
);

// Answers arrive untyped and are checked against the type's fields on the server.
export const newRequestSchema = createInsertSchema(approvalRequests)
  .pick({ typeId: true })
  .extend({ ...actorShape, answers: answersSchema });
export const requestUpdateSchema = z.object({ ...idShape, ...actorShape, answers: answersSchema });

export const transitionSchema = z.object({
  ...idShape,
  ...actorShape,
  to: z.enum(["submitted", "approved", "rejected", "returned", "withdrawn"]),
  comment: z.string().trim().max(2000).optional(),
});

export const listFilterSchema = z.object({
  submitterId: z.number().int().optional(),
  typeId: z.number().int().optional(),
  status: z.enum(requestStatus.enumValues).optional(),
});

// `website` is a honeypot: the public form hides it, so only a bot fills it in.
export const publicRequestSchema = z.object({
  token: z.uuid(),
  contact: z.string().trim().min(1).max(200),
  answers: answersSchema,
  website: z.string().max(200).optional(),
});

export type RequestType = typeof approvalTypes.$inferSelect;
export type Request = typeof approvalRequests.$inferSelect;
export type Decision = typeof approvalDecisions.$inferSelect;
export type Status = Request["status"];
export type NewType = z.input<typeof newTypeSchema>;
export type TypeUpdate = z.input<typeof typeUpdateSchema>;
export type NewRequest = z.input<typeof newRequestSchema>;
export type RequestUpdate = z.input<typeof requestUpdateSchema>;
export type Transition = z.input<typeof transitionSchema>;
export type ListFilter = z.input<typeof listFilterSchema>;
export type PublicRequest = z.input<typeof publicRequestSchema>;
