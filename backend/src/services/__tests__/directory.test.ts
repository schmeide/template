import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { directoryEntries } from "../../db/schema/directory.ts";
import { people } from "../../db/schema/people.ts";
import { addStaff, getStaff, listStaff, listTeams, saveEntry } from "../directory.ts";
import { addPerson } from "../people.ts";

// Tests share one database, so each names its people from one random prefix and searches for it.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const today = "2026-06-15";

const names = async (search: string, filter: { team?: string; former?: boolean } = {}) =>
  (await listStaff(db, { today, search, ...filter })).map(({ person }) => person.name);

const entriesFor = (personId: number) =>
  db.select().from(directoryEntries).where(eq(directoryEntries.personId, personId));

describe("directory service", () => {
  it("lists every person, with their entry where they have one", async () => {
    const prefix = randomUUID();
    const ana = await addPerson(db, { name: `${prefix} Ana` });
    const sam = await addPerson(db, { name: `${prefix} Sam` });
    await saveEntry(db, { personId: ana.id, jobTitle: "Accountant", team: "Finance" });

    const listed = await listStaff(db, { today, search: prefix });

    expect(listed).toEqual([
      {
        person: ana,
        entry: expect.objectContaining({ jobTitle: "Accountant", team: "Finance", email: "" }),
      },
      { person: sam, entry: null },
    ]);
  });

  it("saving a person's first details makes their entry, and saving again changes it", async () => {
    const person = await addPerson(db, { name: randomUUID() });

    const first = await saveEntry(db, { personId: person.id, email: "ana@example.com" });
    const second = await saveEntry(db, {
      personId: person.id,
      phone: "555 0100",
      startsOn: "2024-03-01",
    });

    expect(first).toMatchObject({ email: "ana@example.com" });
    // Every field is saved; one left out goes back to empty.
    expect(second).toMatchObject({ email: "", phone: "555 0100", startsOn: "2024-03-01" });
    expect(await getStaff(db, person.id)).toEqual({ person, entry: second });
  });

  it("makes one entry when two first saves for a person happen at once", async () => {
    const person = await addPerson(db, { name: randomUUID() });

    const saved = await Promise.all([
      saveEntry(db, { personId: person.id, team: "Sales" }),
      saveEntry(db, { personId: person.id, team: "Support" }),
    ]);

    expect(saved.every((entry) => entry !== undefined)).toBe(true);
    const rows = await entriesFor(person.id);
    expect(rows).toHaveLength(1);
    expect(["Sales", "Support"]).toContain(rows[0].team);
  });

  it("refuses details for a person who does not exist", async () => {
    expect(await saveEntry(db, { personId: 2_000_000_000, team: "Sales" })).toBeUndefined();
    expect(await getStaff(db, 2_000_000_000)).toBeUndefined();
  });

  it("gives a person with no entry an empty page", async () => {
    const person = await addPerson(db, { name: randomUUID() });

    expect(await getStaff(db, person.id)).toEqual({ person, entry: null });
  });

  it("searches name, email, job title and team, ignoring case", async () => {
    const prefix = randomUUID();
    const ana = await addPerson(db, { name: `${prefix} Ana` });
    const sam = await addPerson(db, { name: `${prefix} Sam` });
    await saveEntry(db, {
      personId: ana.id,
      email: `ana.${prefix}@example.com`,
      jobTitle: `Payroll ${prefix}`,
      team: `Finance ${prefix}`,
    });
    await saveEntry(db, { personId: sam.id, notes: `unique-${prefix}` });

    expect(await names(`${prefix} SAM`)).toEqual([sam.name]);
    expect(await names(`ana.${prefix}@`)).toEqual([ana.name]);
    expect(await names(`payroll ${prefix}`)).toEqual([ana.name]);
    expect(await names(`finance ${prefix}`)).toEqual([ana.name]);
    // Notes are not searched.
    expect(await names(`unique-${prefix}`)).toEqual([]);
    // % and _ match themselves.
    expect(await names(`${prefix}%`)).toEqual([]);
  });

  it("filters by team and lists the teams in use", async () => {
    const prefix = randomUUID();
    const team = `Team ${prefix}`;
    const ana = await addPerson(db, { name: `${prefix} Ana` });
    const sam = await addPerson(db, { name: `${prefix} Sam` });
    await saveEntry(db, { personId: ana.id, team });
    await saveEntry(db, { personId: sam.id, team: `Other ${prefix}` });

    expect(await names(prefix, { team })).toEqual([ana.name]);
    expect(await listTeams(db)).toEqual(expect.arrayContaining([team, `Other ${prefix}`]));
    expect(await listTeams(db)).not.toContain("");
  });

  it("lists current staff by default and those who left before today on request", async () => {
    const prefix = randomUUID();
    const left = await addPerson(db, { name: `${prefix} Left` });
    const leavingToday = await addPerson(db, { name: `${prefix} Leaving today` });
    const leavingLater = await addPerson(db, { name: `${prefix} Leaving later` });
    const staying = await addPerson(db, { name: `${prefix} Staying` });
    await saveEntry(db, { personId: left.id, leavesOn: "2026-06-14" });
    await saveEntry(db, { personId: leavingToday.id, leavesOn: today });
    await saveEntry(db, { personId: leavingLater.id, leavesOn: "2026-09-30" });

    expect(await names(prefix)).toEqual([leavingLater.name, leavingToday.name, staying.name]);
    expect(await names(prefix, { former: true })).toEqual([left.name]);
    // A leaver is never deleted: the next day they are former staff.
    expect(
      (await listStaff(db, { today: "2026-06-16", search: prefix, former: true })).map(
        ({ person }) => person.name
      )
    ).toEqual([leavingToday.name, left.name]);
  });

  it("adds a person and their entry together", async () => {
    const name = randomUUID();

    const added = await addStaff(db, { name, team: "Sales", startsOn: "2026-07-01" });

    expect(added).toMatchObject({
      person: { name },
      entry: { team: "Sales", startsOn: "2026-07-01" },
    });
    expect(await names(name)).toEqual([name]);
  });

  it("adds no name when the entry cannot be saved", async () => {
    const name = randomUUID();

    await expect(addStaff(db, { name, startsOn: "not a date" })).rejects.toThrow();

    expect(await db.select().from(people).where(eq(people.name, name))).toEqual([]);
  });

  it("gives a name already in Acting as its first entry, but refuses one already listed", async () => {
    const person = await addPerson(db, { name: randomUUID() });

    const first = await addStaff(db, { name: person.name, team: "Sales" });
    const again = await addStaff(db, { name: person.name, team: "Support" });

    expect(first).toMatchObject({ person, entry: { team: "Sales" } });
    expect(again).toBe("listed");
    expect((await entriesFor(person.id))[0].team).toBe("Sales");
  });
});
