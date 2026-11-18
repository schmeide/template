import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fileLimits, type Upload } from "../db/schema/files.ts";
import { fileMessages } from "../services/files.ts";

// Makes the routes of the plugin it is called in take one file as the raw request body, sent with
// its own type and its name in `?name=`. A type not allowed is answered with 415 before the body
// is read, and a body over the size cap with 413, each with a message to show. The plugin's
// routes take no JSON; Fastify keeps these parsers inside the plugin.
export const acceptFiles = (app: FastifyInstance) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    Object.keys(fileLimits.types),
    { parseAs: "buffer", bodyLimit: fileLimits.bytes },
    (_request, body, done) => done(null, body)
  );
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const message = { 413: fileMessages.size, 415: fileMessages.type }[error.statusCode ?? 0];
    if (!message) throw error;
    return reply.code(error.statusCode ?? 500).send({ message });
  });
};

// The file in a request to a route of a plugin that called `acceptFiles`.
export const readUpload = (request: FastifyRequest): Upload => {
  const { name } = request.query as { readonly name?: unknown };
  return {
    name: typeof name === "string" ? name : "",
    type: (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(),
    bytes: request.body as Buffer,
  };
};

// RFC 5987 encoding, which also escapes the characters encodeURIComponent leaves.
const encoded = (name: string) =>
  encodeURIComponent(name).replaceAll(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

// Sends a stored file as a download. `nosniff` stops a browser guessing a type it would run.
export const sendFile = (
  reply: FastifyReply,
  file: { readonly name: string; readonly type: string; readonly bytes: Uint8Array }
) =>
  reply
    .header("content-type", file.type)
    .header("content-disposition", `attachment; filename*=UTF-8''${encoded(file.name)}`)
    .header("x-content-type-options", "nosniff")
    .send(Buffer.from(file.bytes));
