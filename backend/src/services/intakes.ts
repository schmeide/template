import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvalDecisions, approvalRequests, approvalTypes } from "../db/schema/approval.ts";
import { customers } from "../db/schema/customers.ts";
import {
  customerIntakes,
  type Intake,
  type IntakeSubmission,
  type SendIntake,
} from "../db/schema/intakes.ts";
import { parseAnswers } from "./approval.ts";

// A new link for one customer and one request type, with a random token Postgres makes.
export const sendIntake = async (db: Db, input: Readonly<SendIntake>): Promise<Intake> => {
  const [intake] = await db.insert(customerIntakes).values(input).returning();
  return intake;
};

// A customer's links, newest first, with the request each one filed once it came back.
export const listIntakes = (db: Db, customerId: number) =>
  db
    .select({
      token: customerIntakes.token,
      typeName: approvalTypes.name,
      createdAt: customerIntakes.createdAt,
      requestId: customerIntakes.requestId,
      status: approvalRequests.status,
      submittedAt: approvalRequests.submittedAt,
    })
    .from(customerIntakes)
    .innerJoin(approvalTypes, eq(customerIntakes.typeId, approvalTypes.id))
    .leftJoin(approvalRequests, eq(customerIntakes.requestId, approvalRequests.id))
    .where(eq(customerIntakes.customerId, customerId))
    .orderBy(desc(customerIntakes.createdAt));

// What the form behind an unused link shows: the type's name and fields. Nothing about the
// customer, so a leaked link gives nothing away.
export const getIntakeForm = async (db: Db, token: string) => {
  const [form] = await db
    .select({ name: approvalTypes.name, fields: approvalTypes.fields })
    .from(customerIntakes)
    .innerJoin(approvalTypes, eq(customerIntakes.typeId, approvalTypes.id))
    .where(and(eq(customerIntakes.token, token), isNull(customerIntakes.requestId)));
  return form;
};

// Files the answers as a submitted request for the link's customer, once. The link's row is
// locked first, so of two submissions at once the second waits, sees the request and is refused.
// Undefined for an unknown or used link. Answers are checked as public intake checks them.
export const submitIntake = (
  db: Db,
  { token, answers, website }: Readonly<IntakeSubmission>
): Promise<{ readonly received: true } | undefined> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ intake: customerIntakes, type: approvalTypes, customerName: customers.name })
      .from(customerIntakes)
      .innerJoin(approvalTypes, eq(customerIntakes.typeId, approvalTypes.id))
      .innerJoin(customers, eq(customerIntakes.customerId, customers.id))
      .where(eq(customerIntakes.token, token))
      .for("update", { of: customerIntakes });
    if (!row || row.intake.requestId !== null) return undefined;
    // The honeypot: the same answer, nothing kept, and the link stays open.
    if (website) return { received: true } as const;
    const parsed = parseAnswers(row.type.fields, answers, true);
    const [request] = await tx
      .insert(approvalRequests)
      .values({
        typeId: row.type.id,
        contact: row.customerName,
        fields: row.type.fields,
        answers: parsed,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning({ id: approvalRequests.id });
    await tx.insert(approvalDecisions).values({ requestId: request.id, outcome: "submitted" });
    await tx
      .update(customerIntakes)
      .set({ requestId: request.id })
      .where(eq(customerIntakes.token, token));
    return { received: true } as const;
  });
