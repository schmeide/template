import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvalRequests, approvalTypes } from "../db/schema/approval.ts";
import { registryRecords } from "../db/schema/registry.ts";
import { requestUnits, type SetRequestUnit } from "../db/schema/requestUnits.ts";

export type Refusal = "no request" | "no unit" | "unit archived";

const unitColumns = {
  id: registryRecords.id,
  name: registryRecords.name,
  tag: registryRecords.tag,
  archivedAt: registryRecords.archivedAt,
};

export type Unit = { readonly id: number; readonly name: string; readonly tag: string };

// Files the request against the unit, replacing any unit it had, or clears it when the unit is
// null. The request's status is left alone. Returns the unit chosen.
export const setRequestUnit = (
  db: Db,
  { requestId, recordId }: Readonly<SetRequestUnit>
): Promise<Unit | null | Refusal> =>
  db.transaction(async (tx) => {
    const [request] = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    if (!request) return "no request";
    if (recordId === null) {
      await tx.delete(requestUnits).where(eq(requestUnits.requestId, requestId));
      return null;
    }
    // The share lock holds off archiving the unit until this commits.
    const [unit] = await tx
      .select(unitColumns)
      .from(registryRecords)
      .where(eq(registryRecords.id, recordId))
      .for("share");
    if (!unit) return "no unit";
    if (unit.archivedAt) return "unit archived";
    await tx
      .insert(requestUnits)
      .values({ requestId, recordId })
      .onConflictDoUpdate({ target: requestUnits.requestId, set: { recordId } });
    return { id: unit.id, name: unit.name, tag: unit.tag };
  });

// The unit a request is about, archived or not, or null when it has none.
export const unitForRequest = async (db: Db, requestId: number) => {
  const [unit] = await db
    .select(unitColumns)
    .from(requestUnits)
    .innerJoin(registryRecords, eq(requestUnits.recordId, registryRecords.id))
    .where(eq(requestUnits.requestId, requestId));
  return unit ?? null;
};

// A unit's maintenance history: its requests, newest first.
// ponytail: no paging; page by id once a unit has hundreds of requests.
export const requestsForUnit = (db: Db, recordId: number) =>
  db
    .select({
      id: approvalRequests.id,
      typeName: approvalTypes.name,
      status: approvalRequests.status,
      submittedAt: approvalRequests.submittedAt,
    })
    .from(requestUnits)
    .innerJoin(approvalRequests, eq(requestUnits.requestId, approvalRequests.id))
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .where(eq(requestUnits.recordId, recordId))
    .orderBy(desc(approvalRequests.id));
