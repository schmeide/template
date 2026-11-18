import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "../customers.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

describe("customers service", () => {
  it("creates a customer with empty optional fields", async () => {
    const name = randomUUID();

    const customer = await createCustomer(db, { name });

    expect(customer).toMatchObject({ name, email: "", phone: "", address: "" });
    expect(await getCustomer(db, customer.id)).toEqual(customer);
  });

  it("lists customers by name", async () => {
    const suffix = randomUUID();
    const zed = await createCustomer(db, { name: `zz ${suffix}` });
    const amy = await createCustomer(db, { name: `aa ${suffix}` });

    const ids = (await listCustomers(db)).map((customer) => customer.id);

    expect(ids.indexOf(amy.id)).toBeLessThan(ids.indexOf(zed.id));
    expect(ids.indexOf(amy.id)).toBeGreaterThanOrEqual(0);
  });

  it("updates a customer", async () => {
    const customer = await createCustomer(db, { name: randomUUID() });

    const updated = await updateCustomer(db, {
      id: customer.id,
      name: "Renamed",
      email: "a@example.com",
      phone: "555",
      address: "1 Main St",
    });

    expect(updated).toMatchObject({ id: customer.id, name: "Renamed", address: "1 Main St" });
  });

  it("returns undefined for a missing customer", async () => {
    expect(await getCustomer(db, -1)).toBeUndefined();
    expect(await updateCustomer(db, { id: -1, name: "x" })).toBeUndefined();
  });
});
