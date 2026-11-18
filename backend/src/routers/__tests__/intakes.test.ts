import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const fields = [{ label: "Reason", kind: "text" as const, required: true }];
const fails = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

const sent = async () => {
  const customer = await caller.customers.create({
    name: randomUUID(),
    email: `${randomUUID()}@example.com`,
  });
  const type = await caller.requests.createType({ name: randomUUID(), fields });
  const intake = await caller.intakes.send({ customerId: customer.id, typeId: type.id });
  return { customer, type, token: intake.token };
};

describe("intakes router", () => {
  it("shows the form without a trace of the customer and files the answers", async () => {
    const { customer, type, token } = await sent();
    const visitor = appRouter.createCaller({ db, ip: randomUUID() });

    const form = await visitor.intakes.form({ token });
    const received = await visitor.intakes.submit({
      token,
      answers: { Reason: "Back pain" },
      website: "",
    });

    expect(form).toEqual({ name: type.name, fields });
    expect(received).toEqual({ received: true });
    const shown = JSON.stringify([form, received]);
    for (const detail of [customer.name, customer.email]) {
      expect(shown).not.toContain(detail);
    }
    expect(await caller.intakes.list({ customerId: customer.id })).toMatchObject([
      { token, typeName: type.name, status: "submitted" },
    ]);
  });

  it("refuses a used link, unknown token and malformed token", async () => {
    const { token } = await sent();
    const visitor = appRouter.createCaller({ db, ip: randomUUID() });
    await visitor.intakes.submit({ token, answers: { Reason: "x" } });

    await expect(visitor.intakes.submit({ token, answers: { Reason: "y" } })).rejects.toMatchObject(
      fails("NOT_FOUND")
    );
    await expect(visitor.intakes.form({ token })).rejects.toMatchObject(fails("NOT_FOUND"));
    await expect(visitor.intakes.form({ token: randomUUID() })).rejects.toMatchObject(
      fails("NOT_FOUND")
    );
    await expect(visitor.intakes.form({ token: "1" })).rejects.toMatchObject(fails("BAD_REQUEST"));
  });

  it("answers answers that do not fit the fields as a bad request", async () => {
    const { token } = await sent();
    const visitor = appRouter.createCaller({ db, ip: randomUUID() });

    await expect(visitor.intakes.submit({ token, answers: {} })).rejects.toMatchObject(
      fails("BAD_REQUEST")
    );
  });

  it("slows down one address after five submissions", async () => {
    const visitor = appRouter.createCaller({ db, ip: randomUUID() });
    const send = async () => visitor.intakes.submit({ token: (await sent()).token, answers: {} });

    for (let tried = 0; tried < 5; tried += 1) {
      await expect(send()).rejects.toMatchObject(fails("BAD_REQUEST"));
    }

    await expect(send()).rejects.toMatchObject(fails("TOO_MANY_REQUESTS"));
  });
});
