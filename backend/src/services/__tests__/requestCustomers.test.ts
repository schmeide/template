import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Status } from "../../db/schema/approval.ts";
import { createRequest, createType, getRequest, transition } from "../approval.ts";
import { createCustomer, listCustomers } from "../customers.ts";
import { addPerson } from "../people.ts";
import { convertToCustomer, getForRequest, listForCustomer } from "../requestCustomers.ts";

// Tests share one database, so they create their own rows and assert only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const person = () => addPerson(db, { name: randomUUID() });

// A membership application in `status`, reached through allowed steps.
const requestIn = async (status: Status = "approved") => {
  const [submitter, reviewer] = [await person(), await person()];
  const type = await createType(db, {
    name: `Membership application ${randomUUID()}`,
    fields: [{ label: "Email", kind: "text", required: false }],
  });
  const request = await createRequest(db, {
    typeId: type.id,
    actorId: submitter.id,
    answers: { Email: "ada@example.com" },
  });
  if (!request) throw new Error("The type is missing");
  const step = (to: Exclude<Status, "draft">, actorId: number) =>
    transition(db, { id: request.id, actorId, to });
  if (status === "withdrawn") await step("withdrawn", submitter.id);
  if (["submitted", "approved", "rejected", "returned"].includes(status)) {
    await step("submitted", submitter.id);
  }
  if (status === "approved" || status === "rejected" || status === "returned") {
    await step(status, reviewer.id);
  }
  return request;
};

const newCustomer = () => createCustomer(db, { name: randomUUID() });

describe("request to customer service", () => {
  it("adds an approved request as a new customer and links them both ways", async () => {
    const request = await requestIn();
    const name = randomUUID();

    const customer = await convertToCustomer(db, {
      requestId: request.id,
      customer: { name, email: "ada@example.com" },
    });

    expect(customer).toMatchObject({ name, email: "ada@example.com" });
    if (typeof customer === "string") throw new Error(customer);
    expect(await getForRequest(db, request.id)).toEqual({ id: customer.id, name });
    expect(await listForCustomer(db, customer.id)).toMatchObject([{ id: request.id }]);
    // Converting does not change the request's status.
    expect((await getRequest(db, request.id))?.status).toBe("approved");
  });

  it("links several requests to an existing customer a person picked", async () => {
    const customer = await newCustomer();
    const [first, second] = [await requestIn(), await requestIn()];

    for (const request of [first, second]) {
      expect(
        await convertToCustomer(db, { requestId: request.id, customerId: customer.id })
      ).toEqual(customer);
    }

    expect((await listForCustomer(db, customer.id)).map(({ id }) => id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("converts only an approved request, and only once", async () => {
    const customer = await newCustomer();
    const link = (requestId: number, customerId = customer.id) =>
      convertToCustomer(db, { requestId, customerId });

    for (const status of ["draft", "submitted", "rejected", "returned", "withdrawn"] as const) {
      expect(await link((await requestIn(status)).id)).toBe("not approved");
    }
    const approved = await requestIn();
    await link(approved.id);
    expect(await link(approved.id)).toBe("linked");
    expect(await link(-1)).toBe("not found");
    expect(await link((await requestIn()).id, -1)).toBe("not found");
  });

  it("makes one customer when two people convert a request at once", async () => {
    const request = await requestIn();
    const name = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        convertToCustomer(db, { requestId: request.id, customer: { name } })
      )
    );

    expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
    expect(results.filter((result) => result === "linked")).toHaveLength(3);
    expect((await listCustomers(db)).filter((customer) => customer.name === name)).toHaveLength(1);
  });
});
