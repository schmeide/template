import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { addPerson, listPeople } from "../people.ts";

// Tests share one database, so each adds its own names and asserts only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

describe("people service", () => {
  it("adds a name once and lists it", async () => {
    const name = randomUUID();

    const added = await addPerson(db, { name });
    const again = await addPerson(db, { name });

    expect(again.id).toBe(added.id);
    expect((await listPeople(db)).filter((person) => person.name === name)).toEqual([added]);
  });
});
