import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvalRequests, approvalTypes, type Request } from "../db/schema/approval.ts";
import { dealRequests, type NewDealRequest } from "../db/schema/dealRequests.ts";
import { pipelineItems } from "../db/schema/pipeline.ts";
import { createRequest } from "./approval.ts";

// Makes a draft request of the type, filed by the person acting, and links it to the deal, in one
// transaction. The request goes through the requests shape's createRequest, so its rules still
// hold. Returns undefined when there is no such deal or type.
export const createDealRequest = (
  db: Db,
  { itemId, typeId, actorId }: Readonly<NewDealRequest>
): Promise<Request | undefined> =>
  db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ id: pipelineItems.id })
      .from(pipelineItems)
      .where(eq(pipelineItems.id, itemId));
    if (!deal) return undefined;
    const request = await createRequest(tx, { typeId, actorId, answers: {} });
    if (!request) return undefined;
    await tx.insert(dealRequests).values({ itemId, requestId: request.id });
    return request;
  });

// The deal's requests, newest first, with their type and where they stand now.
export const listDealRequests = (db: Db, itemId: number) =>
  db
    .select({
      id: approvalRequests.id,
      typeName: approvalTypes.name,
      status: approvalRequests.status,
      submittedAt: approvalRequests.submittedAt,
    })
    .from(dealRequests)
    .innerJoin(approvalRequests, eq(dealRequests.requestId, approvalRequests.id))
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .where(eq(dealRequests.itemId, itemId))
    .orderBy(desc(approvalRequests.id));

// The deal a request was filed for, or null when it has none.
export const getRequestDeal = async (db: Db, requestId: number) => {
  const [deal] = await db
    .select({ id: pipelineItems.id, title: pipelineItems.title })
    .from(dealRequests)
    .innerJoin(pipelineItems, eq(dealRequests.itemId, pipelineItems.id))
    .where(eq(dealRequests.requestId, requestId));
  return deal ?? null;
};
