import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db/client.ts";
import { fileIdSchema, idSchema } from "../db/schema/registry.ts";
import { attachFile, getAttachment } from "../services/registry.ts";
import { acceptFiles, readUpload, sendFile } from "./files.ts";

const noAsset = { message: "No asset has that id" };
const noFile = { message: "No asset has that file" };

// Attachments: upload to an asset, and download a file only when an asset has it. Listing and
// removing are in the tRPC router.
export const assetsRoutes: FastifyPluginAsync<{ readonly db: Db }> = async (app, { db }) => {
  acceptFiles(app);

  app.post<{ Params: { id: string } }>("/assets/:id/files", async (request, reply) => {
    const id = idSchema.shape.id.safeParse(Number(request.params.id));
    if (!id.success) return reply.code(404).send(noAsset);
    const result = await attachFile(db, id.data, readUpload(request));
    if (!result) return reply.code(404).send(noAsset);
    if ("problem" in result) return reply.code(400).send({ message: result.problem });
    return reply.code(201).send(result.file);
  });

  app.get<{ Params: { fileId: string } }>("/assets/files/:fileId", async (request, reply) => {
    const fileId = fileIdSchema.shape.fileId.safeParse(Number(request.params.fileId));
    const file = fileId.success ? await getAttachment(db, fileId.data) : undefined;
    return file ? sendFile(reply, file) : reply.code(404).send(noFile);
  });
};
