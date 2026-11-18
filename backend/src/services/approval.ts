import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import {
  approvalDecisions,
  approvalRequests,
  approvalTypes,
  checkAnswerSchema,
  type Answers,
  type Field,
  type ListFilter,
  type NewRequest,
  type NewType,
  type PublicRequest,
  type Request,
  type RequestType,
  type RequestUpdate,
  type Status,
  type Transition,
  type TypeUpdate,
} from "../db/schema/approval.ts";
import { people } from "../db/schema/people.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What a new project starts with: leave requests. Edit for the project.
export const defaultTypes: readonly NewType[] = [
  {
    name: "Leave",
    fields: [
      {
        label: "Kind of leave",
        kind: "choice",
        required: true,
        options: ["Vacation", "Sick", "Personal", "Unpaid"],
      },
      { label: "First day", kind: "date", required: true },
      { label: "Last day", kind: "date", required: true },
      { label: "Note", kind: "text", required: false },
    ],
  },
];

// Answers that do not fit the fields they answer. The message names each field and what is wrong.
export class InvalidAnswers extends Error {}

const needed = "This needs an answer";

const answerSchema = (field: Field, complete: boolean) => {
  const must = complete && field.required;
  const schema =
    field.kind === "text"
      ? z
          .string()
          .trim()
          .min(must ? 1 : 0, needed)
          .max(2000)
      : field.kind === "number"
        ? z.number()
        : field.kind === "date"
          ? z.iso.date()
          : field.kind === "choice"
            ? z
                .string()
                .refine((value) => field.options?.includes(value), "Pick one of the options")
            : checkAnswerSchema;
  return must ? schema : schema.optional();
};

// Checks answers against the fields on the server and keeps only the ones the fields ask for.
// `complete` also requires every required field, as submitting does; a draft may be partial.
export const parseAnswers = (
  fields: readonly Field[],
  answers: unknown,
  complete: boolean
): Answers => {
  const schema = z.object(
    Object.fromEntries(fields.map((field) => [field.label, answerSchema(field, complete)]))
  );
  const result = schema.safeParse(answers, {
    error: (issue) => (issue.input === undefined ? needed : undefined),
  });
  if (!result.success) {
    throw new InvalidAnswers(
      result.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`).join("; ")
    );
  }
  return result.data as Answers;
};

const seedTypes = (db: Db) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${approvalTypes} in exclusive mode`);
    const [{ total }] = await tx.select({ total: count() }).from(approvalTypes);
    if (total === 0) await tx.insert(approvalTypes).values([...defaultTypes]);
  });

// Every request type. A database with none gets the default ones first.
export const listTypes = async (db: Db): Promise<RequestType[]> => {
  const [{ total }] = await db.select({ total: count() }).from(approvalTypes);
  if (total === 0) await seedTypes(db);
  return db.select().from(approvalTypes).orderBy(approvalTypes.name, approvalTypes.id);
};

export const createType = async (db: Db, input: Readonly<NewType>): Promise<RequestType> => {
  const [type] = await db.insert(approvalTypes).values(input).returning();
  return type;
};

// Changing the fields leaves requests already submitted as they were: each keeps its own copy.
export const updateType = async (
  db: Db,
  { id, ...input }: Readonly<TypeUpdate>
): Promise<RequestType | undefined> => {
  const [type] = await db
    .update(approvalTypes)
    .set({ ...input, approverId: input.approverId ?? null })
    .where(eq(approvalTypes.id, id))
    .returning();
  return type;
};

// Opening keeps an existing link; closing forgets it, so reopening makes a new one.
export const setPublic = async (
  db: Db,
  id: number,
  open: boolean
): Promise<RequestType | undefined> => {
  const [type] = await db
    .update(approvalTypes)
    .set({
      publicToken: open ? sql`coalesce(${approvalTypes.publicToken}, gen_random_uuid())` : null,
    })
    .where(eq(approvalTypes.id, id))
    .returning();
  return type;
};

const findType = async (db: Db | Tx, id: number) => {
  const [type] = await db.select().from(approvalTypes).where(eq(approvalTypes.id, id));
  return type;
};

// A draft with the type's fields copied onto it. Answers may be partial until it is submitted.
export const createRequest = async (
  db: Db | Tx,
  { typeId, actorId, answers }: Readonly<NewRequest>
): Promise<Request | undefined> => {
  const type = await findType(db, typeId);
  if (!type) return undefined;
  const [request] = await db
    .insert(approvalRequests)
    .values({
      typeId,
      submitterId: actorId,
      fields: type.fields,
      answers: parseAnswers(type.fields, answers, false),
    })
    .returning();
  return request;
};

// Only the submitter edits, and only a draft or a request returned for changes. Saving copies the
// type's fields as they stand now, so an edited request answers the current questions.
export const updateRequest = async (
  db: Db,
  { id, actorId, answers }: Readonly<RequestUpdate>
): Promise<Request | undefined> => {
  const [current] = await db
    .select({ typeId: approvalRequests.typeId })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, id));
  const type = current && (await findType(db, current.typeId));
  if (!type) return undefined;
  const [request] = await db
    .update(approvalRequests)
    .set({ fields: type.fields, answers: parseAnswers(type.fields, answers, false) })
    .where(
      and(
        eq(approvalRequests.id, id),
        eq(approvalRequests.submitterId, actorId),
        inArray(approvalRequests.status, ["draft", "returned"])
      )
    )
    .returning();
  return request;
};

const moves: Readonly<Record<Status, readonly Status[]>> = {
  draft: ["submitted", "withdrawn"],
  returned: ["submitted", "withdrawn"],
  submitted: ["approved", "rejected", "returned", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

const submitterMoves: readonly Status[] = ["submitted", "withdrawn"];

const mayMove = (
  request: Readonly<Request>,
  approverId: number | null,
  actorId: number,
  to: Status
) => {
  if (!moves[request.status].includes(to)) return false;
  if (submitterMoves.includes(to)) return request.submitterId === actorId;
  // A decision: never on your own request, and only by the approver when the type names one.
  return request.submitterId !== actorId && (approverId === null || approverId === actorId);
};

// Moves a request to `to` if that step is allowed from where it stands now and `actorId` may take
// it, and records it. The request row is locked first, so of two reviewers deciding at once the
// second sees the first's decision and is refused.
export const transition = (
  db: Db,
  { id, actorId, to, comment }: Readonly<Transition>
): Promise<Request | undefined> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ request: approvalRequests, approverId: approvalTypes.approverId })
      .from(approvalRequests)
      .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
      .where(eq(approvalRequests.id, id))
      .for("update", { of: approvalRequests });
    if (!row || !mayMove(row.request, row.approverId, actorId, to)) return undefined;
    if (to === "submitted") parseAnswers(row.request.fields, row.request.answers, true);
    const [moved] = await tx
      .update(approvalRequests)
      .set({ status: to, ...(to === "submitted" ? { submittedAt: new Date() } : {}) })
      .where(eq(approvalRequests.id, id))
      .returning();
    await tx
      .insert(approvalDecisions)
      .values({ requestId: id, actorId, outcome: to, comment: comment?.trim() ?? "" });
    return moved;
  });

const submitters = alias(people, "submitters");

export const listRequests = (db: Db, filter: Readonly<ListFilter>) => {
  const conditions: readonly (SQL | undefined)[] = [
    filter.submitterId === undefined
      ? undefined
      : eq(approvalRequests.submitterId, filter.submitterId),
    filter.typeId === undefined ? undefined : eq(approvalRequests.typeId, filter.typeId),
    filter.status === undefined ? undefined : eq(approvalRequests.status, filter.status),
  ];
  // ponytail: no paging; page by id once a list reaches thousands.
  return db
    .select({
      id: approvalRequests.id,
      typeId: approvalRequests.typeId,
      typeName: approvalTypes.name,
      approverId: approvalTypes.approverId,
      submitterId: approvalRequests.submitterId,
      submitterName: submitters.name,
      contact: approvalRequests.contact,
      status: approvalRequests.status,
      createdAt: approvalRequests.createdAt,
      submittedAt: approvalRequests.submittedAt,
    })
    .from(approvalRequests)
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .leftJoin(submitters, eq(approvalRequests.submitterId, submitters.id))
    .where(and(...conditions))
    .orderBy(desc(approvalRequests.id));
};

// A request with its type's name and approver, who submitted it, and every step, newest first.
export const getRequest = async (db: Db, id: number) => {
  const [row] = await db
    .select({
      request: approvalRequests,
      typeName: approvalTypes.name,
      approverId: approvalTypes.approverId,
      submitterName: submitters.name,
    })
    .from(approvalRequests)
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .leftJoin(submitters, eq(approvalRequests.submitterId, submitters.id))
    .where(eq(approvalRequests.id, id));
  if (!row) return undefined;
  const decisions = await db
    .select({
      id: approvalDecisions.id,
      actorId: approvalDecisions.actorId,
      actorName: people.name,
      outcome: approvalDecisions.outcome,
      comment: approvalDecisions.comment,
      createdAt: approvalDecisions.createdAt,
    })
    .from(approvalDecisions)
    .leftJoin(people, eq(approvalDecisions.actorId, people.id))
    .where(eq(approvalDecisions.requestId, id))
    .orderBy(desc(approvalDecisions.id));
  const { request, ...rest } = row;
  return { ...request, ...rest, decisions };
};

// What the public form shows: the type's name and fields, nothing else.
export const getPublicForm = async (db: Db, token: string) => {
  const [form] = await db
    .select({ name: approvalTypes.name, fields: approvalTypes.fields })
    .from(approvalTypes)
    .where(eq(approvalTypes.publicToken, token));
  return form;
};

// A request from the public link, filed as submitted. The answer says nothing about the request
// or any other, and is the same when the honeypot is filled and nothing is kept.
export const submitPublicly = async (
  db: Db,
  { token, contact, answers, website }: Readonly<PublicRequest>
): Promise<{ readonly received: true } | undefined> => {
  const [type] = await db.select().from(approvalTypes).where(eq(approvalTypes.publicToken, token));
  if (!type) return undefined;
  if (website) return { received: true };
  const parsed = parseAnswers(type.fields, answers, true);
  await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(approvalRequests)
      .values({
        typeId: type.id,
        contact: contact.trim(),
        fields: type.fields,
        answers: parsed,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning({ id: approvalRequests.id });
    await tx.insert(approvalDecisions).values({ requestId: request.id, outcome: "submitted" });
  });
  return { received: true };
};
