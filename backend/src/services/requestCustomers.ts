import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvalRequests, approvalTypes } from "../db/schema/approval.ts";
import { customers, type Customer } from "../db/schema/customers.ts";
import { requestCustomers, type ConvertToCustomer } from "../db/schema/requestCustomers.ts";
import { createCustomer, getCustomer } from "./customers.ts";

// Why a request was not linked: no such request or customer, the request is not approved, or it
// already has its customer.
export type Refusal = "not found" | "not approved" | "linked";

// Links an approved request to the customer a person picked, or to a new one they checked and
// saved. The request's row lock makes a second click wait, then find the first one's customer;
// the unique request id backs it up. The request's status does not change.
export const convertToCustomer = (
  db: Db,
  input: Readonly<ConvertToCustomer>
): Promise<Customer | Refusal> =>
  db.transaction(async (tx) => {
    const [request] = await tx
      .select({ status: approvalRequests.status })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, input.requestId))
      .for("update");
    if (!request) return "not found";
    if (request.status !== "approved") return "not approved";
    const [linked] = await tx
      .select()
      .from(requestCustomers)
      .where(eq(requestCustomers.requestId, input.requestId));
    if (linked) return "linked";
    const customer =
      "customerId" in input
        ? await getCustomer(tx, input.customerId)
        : await createCustomer(tx, input.customer);
    if (!customer) return "not found";
    await tx
      .insert(requestCustomers)
      .values({ requestId: input.requestId, customerId: customer.id });
    return customer;
  });

// The customer a request is linked to, or null when it has none.
export const getForRequest = async (db: Db, requestId: number) => {
  const [row] = await db
    .select({ id: customers.id, name: customers.name })
    .from(requestCustomers)
    .innerJoin(customers, eq(requestCustomers.customerId, customers.id))
    .where(eq(requestCustomers.requestId, requestId));
  return row ?? null;
};

// The requests linked to a customer, oldest first.
export const listForCustomer = (db: Db, customerId: number) =>
  db
    .select({
      id: approvalRequests.id,
      typeName: approvalTypes.name,
      createdAt: approvalRequests.createdAt,
    })
    .from(requestCustomers)
    .innerJoin(approvalRequests, eq(requestCustomers.requestId, approvalRequests.id))
    .innerJoin(approvalTypes, eq(approvalRequests.typeId, approvalTypes.id))
    .where(eq(requestCustomers.customerId, customerId))
    .orderBy(asc(approvalRequests.id));
