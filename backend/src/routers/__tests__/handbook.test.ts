import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const fails = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("handbook router", () => {
  it("writes, finds, edits and confirms a page", async () => {
    const actor = await caller.people.add({ name: randomUUID() });
    const title = `zq${randomUUID().replaceAll("-", "").slice(0, 12)}`;

    const created = await caller.handbook.create({
      title: `  ${title}  `,
      body: "Body",
      section: "  Policies  ",
      trackReads: true,
      actorId: actor.id,
    });
    const edited = await caller.handbook.update({ ...created, body: "Edited", actorId: actor.id });
    await caller.handbook.confirmRead({
      id: created.id,
      version: edited.version,
      actorId: actor.id,
    });

    expect(created).toMatchObject({ title, section: "Policies", version: 1 });
    expect((await caller.handbook.search({ query: title })).map((row) => row.id)).toEqual([
      created.id,
    ]);
    expect((await caller.handbook.list()).map((row) => row.id)).toContain(created.id);
    const detail = await caller.handbook.get({ id: created.id });
    expect(detail).toMatchObject({ body: "Edited", updatedByName: actor.name });
    expect(detail.readers.find((row) => row.id === actor.id)?.readVersion).toBe(2);
    expect(await caller.handbook.move({ id: created.id, direction: "up" })).toBe(true);
  });

  it("answers a stale edit or read with CONFLICT and a missing page with NOT_FOUND", async () => {
    const actor = await caller.people.add({ name: randomUUID() });
    const created = await caller.handbook.create({ title: "T", body: "", actorId: actor.id });
    await caller.handbook.update({ ...created, body: "New", actorId: actor.id });

    await expect(
      caller.handbook.update({ ...created, body: "Lost", actorId: actor.id })
    ).rejects.toMatchObject(fails("CONFLICT"));
    await expect(
      caller.handbook.confirmRead({ id: created.id, version: 1, actorId: actor.id })
    ).rejects.toMatchObject(fails("CONFLICT"));
    await expect(caller.handbook.get({ id: -1 })).rejects.toMatchObject(fails("NOT_FOUND"));
    await expect(caller.handbook.move({ id: -1, direction: "up" })).rejects.toMatchObject(
      fails("NOT_FOUND")
    );
  });

  it("refuses a blank title and an oversized body", async () => {
    await expect(
      caller.handbook.create({ title: "  ", body: "", actorId: 1 })
    ).rejects.toMatchObject(fails("BAD_REQUEST"));
    await expect(
      caller.handbook.create({ title: "T", body: "x".repeat(100_001), actorId: 1 })
    ).rejects.toMatchObject(fails("BAD_REQUEST"));
  });
});
