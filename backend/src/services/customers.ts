import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  customers,
  type Customer,
  type CustomerUpdate,
  type NewCustomer,
} from "../db/schema/customers.ts";

export const listCustomers = (db: Db): Promise<readonly Customer[]> =>
  db.select().from(customers).orderBy(asc(customers.name), asc(customers.id));

export const getCustomer = async (db: Db, id: number): Promise<Customer | undefined> => {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer;
};

export const createCustomer = async (db: Db, input: Readonly<NewCustomer>): Promise<Customer> => {
  const [customer] = await db.insert(customers).values(input).returning();
  return customer;
};

export const updateCustomer = async (
  db: Db,
  { id, ...input }: Readonly<CustomerUpdate>
): Promise<Customer | undefined> => {
  const [customer] = await db.update(customers).set(input).where(eq(customers.id, id)).returning();
  return customer;
};
