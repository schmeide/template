import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.ts";
import { createDb } from "../../db/client.ts";
import { fileLimits } from "../../db/schema/files.ts";
import { fileMessages, saveFile } from "../../services/files.ts";
import { createRecord, removeAttachment } from "../../services/registry.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const app = buildApp(db);
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

const upload = (assetId: number | string, type: string, body: Buffer, name = "receipt.pdf") =>
  app.inject({
    method: "POST",
    url: `/api/assets/${assetId}/files?name=${encodeURIComponent(name)}`,
    headers: { "content-type": type },
    body,
  });

const download = (fileId: number | string) =>
  app.inject({ method: "GET", url: `/api/assets/files/${fileId}` });

describe("assets routes", () => {
  it("uploads a file to an asset and downloads it", async () => {
    const asset = await createRecord(db, { name: randomUUID() });

    const response = await upload(asset.id, "application/pdf", Buffer.from("%PDF-1.7"));

    expect(response.statusCode).toBe(201);
    const file = response.json<{ id: number }>();
    expect(file).toMatchObject({ name: "receipt.pdf", type: "application/pdf", size: 8 });
    const got = await download(file.id);
    expect(got.statusCode).toBe(200);
    expect(got.headers["content-disposition"]).toBe("attachment; filename*=UTF-8''receipt.pdf");
    expect(got.body).toBe("%PDF-1.7");
  });

  it("refuses a type not allowed, a file over the cap, and an empty file", async () => {
    const asset = await createRecord(db, { name: randomUUID() });

    const html = await upload(asset.id, "text/html", Buffer.from("<script></script>"));
    const big = await upload(asset.id, "application/pdf", Buffer.alloc(fileLimits.bytes + 1));
    const empty = await upload(asset.id, "application/pdf", Buffer.alloc(0));

    expect([html.statusCode, html.json()]).toEqual([415, { message: fileMessages.type }]);
    expect([big.statusCode, big.json()]).toEqual([413, { message: fileMessages.size }]);
    expect([empty.statusCode, empty.json()]).toEqual([400, { message: "The file is empty." }]);
  });

  it("answers 404 for an asset that does not exist", async () => {
    expect((await upload(-1, "application/pdf", Buffer.from("%PDF"))).statusCode).toBe(404);
    expect((await upload("x", "application/pdf", Buffer.from("%PDF"))).statusCode).toBe(404);
  });

  it("downloads only files attached to an asset", async () => {
    const loose = await saveFile(db, {
      name: "loose.pdf",
      type: "application/pdf",
      bytes: new Uint8Array([1]),
    });
    const asset = await createRecord(db, { name: randomUUID() });
    const removed = (await upload(asset.id, "text/plain", Buffer.from("hi"))).json<{
      id: number;
    }>();
    await removeAttachment(db, removed.id);

    expect((await download(loose.id)).statusCode).toBe(404);
    expect((await download(removed.id)).statusCode).toBe(404);
    expect((await download("x")).statusCode).toBe(404);
  });
});
