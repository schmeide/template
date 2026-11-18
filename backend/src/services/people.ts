import type { Db } from "../db/client.ts";
import { people, type NewPerson, type Person } from "../db/schema/people.ts";

export const listPeople = (db: Db): Promise<Person[]> =>
  db.select().from(people).orderBy(people.name);

// Adding a name that exists returns that person.
export const addPerson = async (db: Db, input: Readonly<NewPerson>): Promise<Person> => {
  const [person] = await db
    .insert(people)
    .values(input)
    .onConflictDoUpdate({ target: people.name, set: { name: input.name } })
    .returning();
  return person;
};
