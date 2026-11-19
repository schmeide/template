import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

describe("directory router", () => {
  it("adds a person with trimmed details, lists them and saves changes", async () => {
    const name = randomUUID();

    const { person, entry } = await caller.directory.add({ name: ` ${name} `, team: " Sales " });
    await caller.directory.save({ personId: person.id, email: "ana@example.com", team: "Sales" });

    expect(person.name).toBe(name);
    expect(entry.team).toBe("Sales");
    expect(await caller.directory.list({ today: "2026-06-15", search: name })).toEqual([
      { person, entry: expect.objectContaining({ email: "ana@example.com", team: "Sales" }) },
    ]);
  });

  it("refuses a second entry for a name already listed", async () => {
    const name = randomUUID();
    await caller.directory.add({ name });

    await expect(caller.directory.add({ name })).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);
  });

  it("refuses a bad email, a bad date and an unknown person", async () => {
    const { person } = await caller.directory.add({ name: randomUUID() });

    await expect(
      caller.directory.save({ personId: person.id, email: "not an email" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(
      caller.directory.save({ personId: person.id, leavesOn: "31/12/2026" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(caller.directory.get({ personId: 2_000_000_000 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });
});
