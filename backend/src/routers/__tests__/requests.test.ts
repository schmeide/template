import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const fields = [{ label: "Reason", kind: "text", required: true }] as const;

const setup = async () => {
  const submitter = await caller.people.add({ name: randomUUID() });
  const reviewer = await caller.people.add({ name: randomUUID() });
  const type = await caller.requests.createType({ name: randomUUID(), fields: [...fields] });
  return { submitter, reviewer, type };
};

const fails = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("requests router", () => {
  it("files, submits and approves a request, and shows its history", async () => {
    const { submitter, reviewer, type } = await setup();

    const request = await caller.requests.create({
      typeId: type.id,
      actorId: submitter.id,
      answers: { Reason: "Holiday" },
    });
    await caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" });
    await caller.requests.transition({
      id: request.id,
      actorId: reviewer.id,
      to: "approved",
      comment: "  Enjoy  ",
    });

    const detail = await caller.requests.get({ id: request.id });
    expect(detail).toMatchObject({ status: "approved", submitterName: submitter.name });
    expect(detail.submittedAt).toBeInstanceOf(Date);
    expect(detail.decisions.map((step) => [step.outcome, step.actorName, step.comment])).toEqual([
      ["approved", reviewer.name, "Enjoy"],
      ["submitted", submitter.name, ""],
    ]);
    expect((await caller.people.list()).map((person) => person.id)).toContain(reviewer.id);
    expect((await caller.requests.types()).map((candidate) => candidate.id)).toContain(type.id);
  });

  it("refuses self-approval and a step that is not allowed with CONFLICT", async () => {
    const { submitter, reviewer, type } = await setup();
    const request = await caller.requests.create({
      typeId: type.id,
      actorId: submitter.id,
      answers: { Reason: "x" },
    });

    await expect(
      caller.requests.transition({ id: request.id, actorId: reviewer.id, to: "approved" })
    ).rejects.toMatchObject(fails("CONFLICT"));
    await caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" });
    await expect(
      caller.requests.transition({ id: request.id, actorId: submitter.id, to: "approved" })
    ).rejects.toMatchObject(fails("CONFLICT"));
    await expect(
      caller.requests.update({ id: request.id, actorId: submitter.id, answers: {} })
    ).rejects.toMatchObject(fails("CONFLICT"));
  });

  it("answers BAD_REQUEST for answers that do not fit the fields", async () => {
    const { submitter, type } = await setup();

    await expect(
      caller.requests.create({ typeId: type.id, actorId: submitter.id, answers: { Reason: 3 } })
    ).rejects.toMatchObject(fails("BAD_REQUEST"));
    const request = await caller.requests.create({
      typeId: type.id,
      actorId: submitter.id,
      answers: {},
    });
    await expect(
      caller.requests.transition({ id: request.id, actorId: submitter.id, to: "submitted" })
    ).rejects.toMatchObject(fails("BAD_REQUEST"));
  });

  it.each([
    ["no fields", []],
    ["a blank label", [{ label: " ", kind: "text", required: false }]],
    ["a kind it does not know", [{ label: "A", kind: "file", required: false }]],
    ["a choice with one option", [{ label: "A", kind: "choice", required: false, options: ["x"] }]],
    [
      "two fields with one label",
      [
        { label: "A", kind: "text", required: false },
        { label: "A", kind: "date", required: false },
      ],
    ],
  ])("rejects a type with %s", async (_label, fields) => {
    await expect(
      caller.requests.createType({ name: "x", fields: fields as never })
    ).rejects.toMatchObject(fails("BAD_REQUEST"));
  });

  it.each([
    ["get", () => caller.requests.get({ id: -1 })],
    ["create", () => caller.requests.create({ typeId: -1, actorId: 1, answers: {} })],
    ["updateType", () => caller.requests.updateType({ id: -1, name: "x", fields: [...fields] })],
    ["setPublic", () => caller.requests.setPublic({ id: -1, open: true })],
    ["publicForm", () => caller.requests.publicForm({ token: randomUUID() })],
  ])("answers NOT_FOUND from %s for a missing row", async (_label, call) => {
    await expect(call()).rejects.toMatchObject(fails("NOT_FOUND"));
  });

  describe("public form", () => {
    const openType = async () => {
      const { type } = await setup();
      const opened = await caller.requests.setPublic({ id: type.id, open: true });
      return { type, token: opened.publicToken ?? "" };
    };

    it("shows only the form and files a submission", async () => {
      const { type, token } = await openType();
      const visitor = appRouter.createCaller({ db, ip: randomUUID() });

      expect(await visitor.requests.publicForm({ token })).toEqual({
        name: type.name,
        fields,
      });
      expect(
        await visitor.requests.submitPublic({
          token,
          contact: "Pat",
          answers: { Reason: "Leak" },
          website: "",
        })
      ).toEqual({ received: true });
      expect(await caller.requests.list({ typeId: type.id })).toMatchObject([
        { contact: "Pat", status: "submitted" },
      ]);
    });

    it("drops a submission with the honeypot filled", async () => {
      const { type, token } = await openType();
      const bot = appRouter.createCaller({ db, ip: randomUUID() });

      expect(
        await bot.requests.submitPublic({
          token,
          contact: "Bot",
          answers: { Reason: "Spam" },
          website: "spam",
        })
      ).toEqual({ received: true });
      expect(await caller.requests.list({ typeId: type.id })).toEqual([]);
    });

    it("refuses a closed link and a malformed token", async () => {
      const visitor = appRouter.createCaller({ db, ip: randomUUID() });

      await expect(
        visitor.requests.submitPublic({ token: randomUUID(), contact: "Pat", answers: {} })
      ).rejects.toMatchObject(fails("NOT_FOUND"));
      await expect(visitor.requests.publicForm({ token: "1" })).rejects.toMatchObject(
        fails("BAD_REQUEST")
      );
    });

    it("slows down one address after five submissions", async () => {
      const { type, token } = await openType();
      const visitor = appRouter.createCaller({ db, ip: randomUUID() });
      const send = () =>
        visitor.requests.submitPublic({ token, contact: "Pat", answers: { Reason: "x" } });

      for (let sent = 0; sent < 5; sent += 1) await send();

      await expect(send()).rejects.toMatchObject(fails("TOO_MANY_REQUESTS"));
      expect(await caller.requests.list({ typeId: type.id })).toHaveLength(5);
      const other = appRouter.createCaller({ db, ip: randomUUID() });
      await expect(
        other.requests.submitPublic({ token, contact: "Sam", answers: { Reason: "y" } })
      ).resolves.toEqual({ received: true });
    });
  });
});
