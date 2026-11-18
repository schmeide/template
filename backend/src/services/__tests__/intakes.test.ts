import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import type { Field } from "../../db/schema/approval.ts";
import { createType, getRequest, InvalidAnswers } from "../approval.ts";
import { createCustomer } from "../customers.ts";
import { getIntakeForm, listIntakes, sendIntake, submitIntake } from "../intakes.ts";

// Tests share one database, so they assert only on rows they created.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const fields: readonly Field[] = [
  { label: "How did you hear of us", kind: "text", required: true },
  { label: "Consent", kind: "check", required: true },
];
const answers = { "How did you hear of us": "A friend", Consent: { result: "pass" } };

const setup = async () => {
  const customer = await createCustomer(db, {
    name: randomUUID(),
    email: `${randomUUID()}@example.com`,
    phone: "555 0100",
  });
  const type = await createType(db, { name: randomUUID(), fields: [...fields] });
  const intake = await sendIntake(db, { customerId: customer.id, typeId: type.id });
  return { customer, type, intake };
};

describe("intakes service", () => {
  it("makes a fresh random token for every link", async () => {
    const { customer, type, intake } = await setup();

    const again = await sendIntake(db, { customerId: customer.id, typeId: type.id });

    expect(intake.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(again.token).not.toBe(intake.token);
    expect(await listIntakes(db, customer.id)).toMatchObject([
      { token: again.token, typeName: type.name, requestId: null, status: null },
      { token: intake.token, typeName: type.name, requestId: null, status: null },
    ]);
  });

  it("shows the form with the type's name and fields and nothing about the customer", async () => {
    const { customer, type, intake } = await setup();

    const form = await getIntakeForm(db, intake.token);

    expect(form).toEqual({ name: type.name, fields });
    const shown = JSON.stringify(form);
    for (const detail of [customer.name, customer.email, customer.phone]) {
      expect(shown).not.toContain(detail);
    }
  });

  it("files a submitted request linked to the customer and closes the link", async () => {
    const { customer, type, intake } = await setup();

    expect(await submitIntake(db, { token: intake.token, answers })).toEqual({ received: true });

    const [listed] = await listIntakes(db, customer.id);
    expect(listed).toMatchObject({ token: intake.token, status: "submitted" });
    expect(await getRequest(db, listed.requestId ?? -1)).toMatchObject({
      typeId: type.id,
      submitterId: null,
      contact: customer.name,
      fields,
      answers,
      status: "submitted",
      decisions: [{ outcome: "submitted", actorId: null }],
    });
    expect(await getIntakeForm(db, intake.token)).toBeUndefined();
  });

  it("refuses a second submission on the same link", async () => {
    const { customer, intake } = await setup();
    await submitIntake(db, { token: intake.token, answers });

    expect(await submitIntake(db, { token: intake.token, answers })).toBeUndefined();
    expect(await listIntakes(db, customer.id)).toHaveLength(1);
  });

  it("files one request when two people send the same link at once", async () => {
    const { customer, intake } = await setup();

    const results = await Promise.all([
      submitIntake(db, { token: intake.token, answers }),
      submitIntake(db, { token: intake.token, answers }),
    ]);

    expect(results.filter((result) => result?.received)).toHaveLength(1);
    expect(results.filter((result) => result === undefined)).toHaveLength(1);
    const [listed] = await listIntakes(db, customer.id);
    expect(listed.requestId).not.toBeNull();
  });

  it("checks answers as public intake does and leaves the link open when they fail", async () => {
    const { customer, intake } = await setup();

    await expect(
      submitIntake(db, { token: intake.token, answers: { Consent: { result: "maybe" } } })
    ).rejects.toThrow(InvalidAnswers);
    expect(await getIntakeForm(db, intake.token)).toBeDefined();

    await submitIntake(db, { token: intake.token, answers: { ...answers, Extra: "dropped" } });
    const [listed] = await listIntakes(db, customer.id);
    expect((await getRequest(db, listed.requestId ?? -1))?.answers).toEqual(answers);
  });

  it("keeps nothing when the honeypot is filled, and leaves the link open", async () => {
    const { customer, intake } = await setup();

    expect(await submitIntake(db, { token: intake.token, answers, website: "spam" })).toEqual({
      received: true,
    });

    expect(await listIntakes(db, customer.id)).toMatchObject([{ requestId: null }]);
    expect(await getIntakeForm(db, intake.token)).toBeDefined();
  });

  it("knows no form for an unknown token", async () => {
    expect(await getIntakeForm(db, randomUUID())).toBeUndefined();
    expect(await submitIntake(db, { token: randomUUID(), answers })).toBeUndefined();
  });

  it("gives two links sent at once their own tokens", async () => {
    const { customer, type } = await setup();

    const [first, second] = await Promise.all([
      sendIntake(db, { customerId: customer.id, typeId: type.id }),
      sendIntake(db, { customerId: customer.id, typeId: type.id }),
    ]);

    expect(first.token).not.toBe(second.token);
    expect(await listIntakes(db, customer.id)).toHaveLength(3);
  });
});
