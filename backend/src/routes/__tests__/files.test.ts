import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { fileLimits } from "../../db/schema/files.ts";
import { fileMessages } from "../../services/files.ts";
import { acceptFiles, readUpload, sendFile } from "../files.ts";

// A plugin that takes files the way a shape's routes do, beside a JSON route outside it.
const app = Fastify();
app.register(async (scope) => {
  acceptFiles(scope);
  scope.post("/upload", async (request) => {
    const { name, type, bytes } = readUpload(request);
    return { name, type, size: bytes.length };
  });
  scope.get("/download", (_request, reply) =>
    sendFile(reply, {
      name: "Receipt (1) ü.pdf",
      type: "application/pdf",
      bytes: Buffer.from("%PDF"),
    })
  );
});
app.post("/json", async (request) => request.body);
afterAll(() => app.close());

const post = (type: string, body: Buffer | string, name = "a.txt") =>
  app.inject({
    method: "POST",
    url: `/upload?name=${encodeURIComponent(name)}`,
    headers: { "content-type": type },
    body,
  });

describe("acceptFiles", () => {
  it("takes the body as bytes, with the name and the type without parameters", async () => {
    const response = await post("text/plain; charset=UTF-8", "hello", "Notes ü.txt");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: "Notes ü.txt", type: "text/plain", size: 5 });
  });

  it("takes a body at the size cap", async () => {
    const response = await post("application/pdf", Buffer.alloc(fileLimits.bytes));

    expect(response.json()).toMatchObject({ size: fileLimits.bytes });
  });

  it("answers a body over the size cap with 413 and the size message", async () => {
    const response = await post("application/pdf", Buffer.alloc(fileLimits.bytes + 1));

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ message: fileMessages.size });
  });

  it.each(["text/html", "image/svg+xml", "application/json"])(
    "answers %s with 415 and the type message",
    async (type) => {
      const response = await post(type, "<p>hi</p>");

      expect(response.statusCode).toBe(415);
      expect(response.json()).toEqual({ message: fileMessages.type });
    }
  );

  it("leaves JSON parsing in place outside the plugin", async () => {
    const response = await app.inject({ method: "POST", url: "/json", payload: { ok: true } });

    expect(response.json()).toEqual({ ok: true });
  });
});

describe("sendFile", () => {
  it("sends the bytes as an attachment with the file's name and type", async () => {
    const response = await app.inject({ method: "GET", url: "/download" });

    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      "attachment; filename*=UTF-8''Receipt%20%281%29%20%C3%BC.pdf"
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe("%PDF");
  });
});
