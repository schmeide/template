import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { importLimits } from "../../db/schema/registry.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const caller = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const code = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

describe("assets router", () => {
  it("creates, lists, edits, archives and restores an asset", async () => {
    const category = await caller.assets.createCategory({ name: `  ${randomUUID()}  ` });
    const asset = await caller.assets.create({ name: "  Printer  ", categoryId: category.id });

    expect(asset.name).toBe("Printer");
    expect(await caller.assets.list({ categoryId: category.id })).toMatchObject({
      total: 1,
      rows: [{ id: asset.id, category: category.name.trim() }],
    });
    await caller.assets.update({ id: asset.id, name: "Printer 2", categoryId: category.id });
    await caller.assets.archive({ id: asset.id });
    expect((await caller.assets.list({ categoryId: category.id })).total).toBe(0);
    await caller.assets.restore({ id: asset.id });
    expect(await caller.assets.get({ id: asset.id })).toMatchObject({
      name: "Printer 2",
      archivedAt: null,
    });
  });

  it("reports a missing asset, a bad input and a taken category name", async () => {
    const category = await caller.assets.createCategory({ name: randomUUID() });

    await expect(caller.assets.get({ id: -1 })).rejects.toMatchObject(code("NOT_FOUND"));
    await expect(caller.assets.archive({ id: -1 })).rejects.toMatchObject(code("NOT_FOUND"));
    await expect(caller.assets.create({ name: "  " })).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(caller.assets.list({ pageSize: 1000 })).rejects.toMatchObject(code("BAD_REQUEST"));
    await expect(
      caller.assets.createCategory({ name: category.name.toUpperCase() })
    ).rejects.toMatchObject(code("CONFLICT"));
  });

  it("previews and imports a CSV file, refusing one over the size limit", async () => {
    const category = await caller.assets.createCategory({ name: randomUUID() });
    const csv = `Name,Category\nScanner,${category.name}\n`;

    expect(await caller.assets.previewImport({ csv })).toEqual({
      ready: 1,
      ignored: [],
      problems: [],
    });
    expect((await caller.assets.import({ csv })).imported).toBe(1);
    expect(await caller.assets.exportCsv({ categoryId: category.id })).toContain("Scanner");
    await expect(
      caller.assets.previewImport({ csv: "x".repeat(importLimits.characters + 1) })
    ).rejects.toMatchObject(code("BAD_REQUEST"));
  });
});
