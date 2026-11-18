import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("people router", () => {
  it("adds a trimmed name and lists it", async () => {
    const name = randomUUID();

    const person = await caller.people.add({ name: `  ${name}  ` });

    expect(person.name).toBe(name);
    expect((await caller.people.list()).map((listed) => listed.id)).toContain(person.id);
  });

  it("refuses a blank name", async () => {
    await expect(caller.people.add({ name: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
  });
});
