import { TRPCError } from "@trpc/server";
import {
  fileIdSchema,
  filterSchema,
  idSchema,
  importSchema,
  newCategorySchema,
  newRecordSchema,
  pageSchema,
  recordUpdateSchema,
} from "../db/schema/registry.ts";
import {
  archiveRecord,
  commitImport,
  createCategory,
  createRecord,
  exportRecords,
  getRecord,
  listAttachments,
  listCategories,
  listRecords,
  previewImport,
  removeAttachment,
  restoreRecord,
  updateRecord,
} from "../services/registry.ts";
import { procedure, router } from "../trpc.ts";

const found = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No asset has that id" });
  }
  return value;
};

export const assetsRouter = router({
  categories: procedure.query(({ ctx }) => listCategories(ctx.db)),
  createCategory: procedure.input(newCategorySchema).mutation(async ({ ctx, input }) => {
    const category = await createCategory(ctx.db, input);
    if (category === "duplicate") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A category already has that name. Choose another.",
      });
    }
    return category;
  }),
  list: procedure.input(pageSchema).query(({ ctx, input }) => listRecords(ctx.db, input)),
  get: procedure
    .input(idSchema)
    .query(async ({ ctx, input }) => found(await getRecord(ctx.db, input.id))),
  create: procedure
    .input(newRecordSchema)
    .mutation(({ ctx, input }) => createRecord(ctx.db, input)),
  update: procedure
    .input(recordUpdateSchema)
    .mutation(async ({ ctx, input }) => found(await updateRecord(ctx.db, input))),
  archive: procedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => found(await archiveRecord(ctx.db, input.id))),
  restore: procedure
    .input(idSchema)
    .mutation(async ({ ctx, input }) => found(await restoreRecord(ctx.db, input.id))),
  // Upload and download are plain HTTP routes, in backend/src/routes/assets.ts.
  files: procedure.input(idSchema).query(({ ctx, input }) => listAttachments(ctx.db, input.id)),
  removeFile: procedure.input(fileIdSchema).mutation(async ({ ctx, input }) => {
    if (!(await removeAttachment(ctx.db, input.fileId))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No asset has that file" });
    }
  }),
  exportCsv: procedure.input(filterSchema).query(({ ctx, input }) => exportRecords(ctx.db, input)),
  // Mutations, so the file travels in a POST body rather than the address.
  previewImport: procedure
    .input(importSchema)
    .mutation(({ ctx, input }) => previewImport(ctx.db, input.csv)),
  import: procedure
    .input(importSchema)
    .mutation(({ ctx, input }) => commitImport(ctx.db, input.csv)),
});
