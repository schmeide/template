import { and, asc, eq, gte, ilike, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  directoryEntries,
  type DirectoryEntry,
  type NewStaff,
  type SaveEntry,
  type StaffFilter,
} from "../db/schema/directory.ts";
import { people, type Person } from "../db/schema/people.ts";
import { addPerson } from "./people.ts";

export type Staff = { readonly person: Person; readonly entry: DirectoryEntry | null };

// ILIKE treats % and _ as wildcards and \ as their escape.
const contains = (text: string) => `%${text.replaceAll(/[\\%_]/g, "\\$&")}%`;

// Former staff left before today; everyone else, with no entry or no leaving date, is current.
const matching = ({ today, search, team, former = false }: Readonly<StaffFilter>) =>
  and(
    former
      ? lt(directoryEntries.leavesOn, today)
      : or(isNull(directoryEntries.leavesOn), gte(directoryEntries.leavesOn, today)),
    team ? eq(directoryEntries.team, team) : undefined,
    search
      ? or(
          ilike(people.name, contains(search)),
          ilike(directoryEntries.email, contains(search)),
          ilike(directoryEntries.jobTitle, contains(search)),
          ilike(directoryEntries.team, contains(search))
        )
      : undefined
  );

// Every person in `people` matching the filter, by name, with their entry or null.
// ponytail: no paging; a staff list runs to hundreds. Page it as assets does if it grows past that.
export const listStaff = (db: Db, filter: Readonly<StaffFilter>): Promise<Staff[]> =>
  db
    .select({ person: people, entry: directoryEntries })
    .from(people)
    .leftJoin(directoryEntries, eq(directoryEntries.personId, people.id))
    .where(matching(filter))
    .orderBy(asc(people.name), asc(people.id));

// The teams people are in, for the filter.
export const listTeams = async (db: Db): Promise<string[]> =>
  (
    await db
      .selectDistinct({ team: directoryEntries.team })
      .from(directoryEntries)
      .where(ne(directoryEntries.team, ""))
      .orderBy(asc(directoryEntries.team))
  ).map(({ team }) => team);

// Undefined when there is no such person.
export const getStaff = async (db: Db, personId: number): Promise<Staff | undefined> => {
  const [staff] = await db
    .select({ person: people, entry: directoryEntries })
    .from(people)
    .leftJoin(directoryEntries, eq(directoryEntries.personId, people.id))
    .where(eq(people.id, personId));
  return staff;
};

const fields = (input: Readonly<Omit<SaveEntry, "personId">>) => ({
  email: input.email ?? "",
  phone: input.phone ?? "",
  jobTitle: input.jobTitle ?? "",
  team: input.team ?? "",
  startsOn: input.startsOn ?? null,
  leavesOn: input.leavesOn ?? null,
  notes: input.notes ?? "",
});

// Saves every field; one left out goes back to empty. The first save makes the entry, and
// unique(person_id) turns a second first save at the same moment into an update of it.
// Undefined when there is no such person.
export const saveEntry = async (
  db: Db,
  { personId, ...input }: Readonly<SaveEntry>
): Promise<DirectoryEntry | undefined> => {
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person) return undefined;
  const values = fields(input);
  const [entry] = await db
    .insert(directoryEntries)
    .values({ personId, ...values })
    .onConflictDoUpdate({ target: directoryEntries.personId, set: values })
    .returning();
  return entry;
};

// Adds the name through `addPerson` and their entry in one transaction. A name already in
// "Acting as" gets its first entry; "listed" when that person already has one, which is left as
// it was.
export const addStaff = (
  db: Db,
  { name, ...input }: Readonly<NewStaff>
): Promise<{ readonly person: Person; readonly entry: DirectoryEntry } | "listed"> =>
  db.transaction(async (tx) => {
    const person = await addPerson(tx, { name });
    const [entry] = await tx
      .insert(directoryEntries)
      .values({ personId: person.id, ...fields(input) })
      .onConflictDoNothing()
      .returning();
    return entry ? { person, entry } : "listed";
  });
