import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createDb } from "../db/client.ts";
import { appRouter } from "../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
const app = buildApp(db);
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

describe("notes router", () => {
  it("creates a note that list then returns", async () => {
    const body = randomUUID();

    const created = await caller.notes.create({ body });
    const listed = await caller.notes.list();

    expect(created.body).toBe(body);
    expect(listed.map((note) => note.id)).toContain(created.id);
  });

  it.each([
    ["an empty body", ""],
    ["a blank body", "   "],
    ["a body over 500 characters", "x".repeat(501)],
  ])("rejects %s", async (_label, body) => {
    await expect(caller.notes.create({ body })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });
});

describe("http", () => {
  it.each(["/healthz", "/api/healthz"])("serves %s", async (url) => {
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
  });

  it("mounts tRPC under /api/trpc", async () => {
    const response = await app.inject({ method: "GET", url: "/api/trpc/notes.list" });

    expect(response.statusCode).toBe(200);
  });
});
