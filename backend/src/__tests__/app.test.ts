import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createDb } from "../db/client.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const app = buildApp(db);
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

describe("http", () => {
  it.each(["/healthz", "/api/healthz"])("serves %s", async (url) => {
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
  });

  it("answers an unknown procedure with 404 under /api/trpc", async () => {
    const response = await app.inject({ method: "GET", url: "/api/trpc/missing.procedure" });

    expect(response.statusCode).toBe(404);
  });
});
