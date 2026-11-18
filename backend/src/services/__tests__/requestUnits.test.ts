import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Status } from "../../db/schema/approval.ts";
import { createRequest, createType, getRequest, transition } from "../approval.ts";
import { addPerson } from "../people.ts";
import { archiveRecord, createRecord } from "../registry.ts";
import { requestsForUnit, setRequestUnit, unitForRequest } from "../requestUnits.ts";

// Tests share one database, so they create their own rows and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newUnit = () => createRecord(db, { name: randomUUID(), tag: randomUUID().slice(0, 8) });

// A request reached through allowed steps: a draft, or submitted and then decided.
const requestIn = async (status: Status = "submitted") => {
  const submitter = await addPerson(db, { name: randomUUID() });
  const reviewer = await addPerson(db, { name: randomUUID() });
  const type = await createType(db, {
    name: `Repair ${randomUUID()}`,
    fields: [{ label: "Problem", kind: "text", required: true }],
  });
  const request = await createRequest(db, {
    typeId: type.id,
    actorId: submitter.id,
    answers: { Problem: "Leak" },
  });
  if (!request) throw new Error("The type is missing");
  if (status !== "draft") {
    await transition(db, { id: request.id, actorId: submitter.id, to: "submitted" });
  }
  if (status === "approved" || status === "rejected") {
    await transition(db, { id: request.id, actorId: reviewer.id, to: status });
  }
  return { request, type };
};

describe("request to unit service", () => {
  it("files a request against a unit, from either side", async () => {
    const unit = await newUnit();
    const { request, type } = await requestIn();

    expect(await setRequestUnit(db, { requestId: request.id, recordId: unit.id })).toMatchObject({
      id: unit.id,
      name: unit.name,
    });

    expect(await unitForRequest(db, request.id)).toMatchObject({ id: unit.id, name: unit.name });
    expect(await requestsForUnit(db, unit.id)).toEqual([
      {
        id: request.id,
        typeName: type.name,
        status: "submitted",
        submittedAt: expect.any(Date),
      },
    ]);
  });

  it("keeps one unit per request: choosing another replaces it, and clearing removes it", async () => {
    const first = await newUnit();
    const second = await newUnit();
    const { request } = await requestIn();
    await setRequestUnit(db, { requestId: request.id, recordId: first.id });

    await setRequestUnit(db, { requestId: request.id, recordId: second.id });

    expect((await unitForRequest(db, request.id))?.id).toBe(second.id);
    expect(await requestsForUnit(db, first.id)).toEqual([]);

    expect(await setRequestUnit(db, { requestId: request.id, recordId: null })).toBeNull();
    expect(await unitForRequest(db, request.id)).toBeNull();
    expect(await requestsForUnit(db, second.id)).toEqual([]);
  });

  it("keeps one unit when two people choose at once", async () => {
    const units = await Promise.all([newUnit(), newUnit(), newUnit()]);
    const { request } = await requestIn();

    await Promise.all(
      units.map((unit) => setRequestUnit(db, { requestId: request.id, recordId: unit.id }))
    );

    const chosen = await unitForRequest(db, request.id);
    const histories = await Promise.all(units.map((unit) => requestsForUnit(db, unit.id)));
    expect(histories.filter((history) => history.length > 0)).toHaveLength(1);
    expect(units.map((unit) => unit.id)).toContain(chosen?.id);
  });

  it("lists a unit's requests newest first", async () => {
    const unit = await newUnit();
    const older = await requestIn("approved");
    const newer = await requestIn("draft");
    await setRequestUnit(db, { requestId: older.request.id, recordId: unit.id });
    await setRequestUnit(db, { requestId: newer.request.id, recordId: unit.id });

    expect(await requestsForUnit(db, unit.id)).toEqual([
      expect.objectContaining({ id: newer.request.id, status: "draft", submittedAt: null }),
      expect.objectContaining({ id: older.request.id, status: "approved" }),
    ]);
  });

  it("chooses only a unit that is not archived, and keeps the history of one archived later", async () => {
    const archived = await newUnit();
    await archiveRecord(db, archived.id);
    const later = await newUnit();
    const { request } = await requestIn();

    expect(await setRequestUnit(db, { requestId: request.id, recordId: archived.id })).toBe(
      "unit archived"
    );
    expect(await setRequestUnit(db, { requestId: request.id, recordId: 2_000_000_000 })).toBe(
      "no unit"
    );

    await setRequestUnit(db, { requestId: request.id, recordId: later.id });
    await archiveRecord(db, later.id);
    expect(await requestsForUnit(db, later.id)).toHaveLength(1);
    expect(await unitForRequest(db, request.id)).toMatchObject({
      id: later.id,
      archivedAt: expect.any(Date),
    });
  });

  it("refuses a request that does not exist", async () => {
    const unit = await newUnit();

    expect(await setRequestUnit(db, { requestId: 2_000_000_000, recordId: unit.id })).toBe(
      "no request"
    );
  });

  it("links in any status and leaves the status as it was", async () => {
    const unit = await newUnit();
    for (const status of ["draft", "submitted", "approved", "rejected"] as const) {
      const { request } = await requestIn(status);

      await setRequestUnit(db, { requestId: request.id, recordId: unit.id });

      expect((await getRequest(db, request.id))?.status).toBe(status);
      expect((await unitForRequest(db, request.id))?.id).toBe(unit.id);
    }
  });
});
