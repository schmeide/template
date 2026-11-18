import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  approvalRequests,
  approvalTypes,
  type Answer,
  type Request,
} from "../db/schema/approval.ts";
import { pipelineItems, pipelineStages, type Item } from "../db/schema/pipeline.ts";
import { requestDeals, type ConvertRequest } from "../db/schema/requestDeals.ts";
import { createCustomer, getCustomer } from "./customers.ts";
import { addNote, getBoard, insertItem } from "./pipeline.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// A note holds at most this many characters (`pipeline_activity.text`).
const noteLength = 2000;

const firstStage = async (db: Db | Tx) => {
  const [stage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.position))
    .limit(1);
  return stage;
};

const answerText = (answer: Answer) => {
  if (typeof answer !== "object") return String(answer);
  const result = answer.result === "pass" ? "Pass" : "Fail";
  return answer.note ? `${result} (${answer.note})` : result;
};

// The contact, then one line per answered field, in the request's order.
const noteFor = (request: Readonly<Request>) =>
  [
    ...(request.contact ? [`Contact: ${request.contact}`] : []),
    ...request.fields.flatMap(({ label }) => {
      const answer = request.answers[label];
      return answer === undefined || answer === "" ? [] : [`${label}: ${answerText(answer)}`];
    }),
  ]
    .join("\n")
    // ponytail: long answers are cut at the note's limit; split them over several notes if that bites.
    .slice(0, noteLength);

// Makes an approved request into a deal in the first stage, titled from the request type, for
// the customer picked or a new one, with the answers in its first note. Returns undefined when the
// request is not approved, already has its deal, or the customer picked does not exist.
export const convertRequest = async (
  db: Db,
  input: Readonly<ConvertRequest>
): Promise<Item | undefined> => {
  // The board adds its default stages the first time it loads; a deal may come before that.
  if (!(await firstStage(db))) await getBoard(db);
  return db.transaction(async (tx) => {
    // The row lock makes a second conversion of the same request wait, then find the first one.
    const [row] = await tx
      .select({ request: approvalRequests, typeName: approvalTypes.name })
      .from(approvalRequests)
      .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
      .where(and(eq(approvalRequests.id, input.requestId), eq(approvalRequests.status, "approved")))
      .for("update", { of: approvalRequests });
    if (!row) return undefined;
    const [converted] = await tx
      .select()
      .from(requestDeals)
      .where(eq(requestDeals.requestId, input.requestId));
    if (converted) return undefined;
    const customer =
      "customerId" in input
        ? await getCustomer(tx, input.customerId)
        : await createCustomer(tx, input.customer);
    const stage = await firstStage(tx);
    if (!customer || !stage) return undefined;
    const item = await insertItem(tx, {
      title: row.typeName,
      stageId: stage.id,
      customerId: customer.id,
    });
    if (!item) return undefined;
    const text = noteFor(row.request);
    if (text) await addNote(tx, { itemId: item.id, text });
    await tx.insert(requestDeals).values({ requestId: input.requestId, itemId: item.id });
    return item;
  });
};

const link = async (db: Db, where: SQL) => {
  const [row] = await db
    .select({
      requestId: requestDeals.requestId,
      typeName: approvalTypes.name,
      itemId: requestDeals.itemId,
      title: pipelineItems.title,
    })
    .from(requestDeals)
    .innerJoin(approvalRequests, eq(requestDeals.requestId, approvalRequests.id))
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .innerJoin(pipelineItems, eq(requestDeals.itemId, pipelineItems.id))
    .where(where);
  if (!row) return null;
  return {
    request: { id: row.requestId, typeName: row.typeName },
    deal: { id: row.itemId, title: row.title },
  };
};

// The request and deal linked to a request, or null when it has none.
export const getForRequest = (db: Db, requestId: number) =>
  link(db, eq(requestDeals.requestId, requestId));

// The request and deal linked to a deal, or null when it has none.
export const getForDeal = (db: Db, itemId: number) => link(db, eq(requestDeals.itemId, itemId));
