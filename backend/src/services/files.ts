import type { Db } from "../db/client.ts";
import {
  fileColumns,
  fileLimits,
  fileNameSchema,
  files,
  type StoredFile,
  type Upload,
} from "../db/schema/files.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const kinds = Object.values(fileLimits.types);

// What to tell the person when a file breaks a limit. Routes answer with these too.
export const fileMessages = {
  type: `Choose a ${kinds.slice(0, -1).join(", ")} or ${kinds.at(-1)} file.`,
  size: `A file can be at most ${fileLimits.bytes / 1024 / 1024} MB. Choose a smaller one.`,
} as const;

// Why an upload cannot be kept, in words for the person who chose it; undefined when it can.
export const fileProblem = ({ name, type, bytes }: Readonly<Upload>): string | undefined => {
  if (!Object.hasOwn(fileLimits.types, type)) return fileMessages.type;
  if (bytes.length === 0) return "The file is empty.";
  if (bytes.length > fileLimits.bytes) return fileMessages.size;
  const issue = fileNameSchema.safeParse(name).error?.issues[0];
  if (issue?.code === "too_big") {
    return `A file name can be at most ${String(issue.maximum)} characters. Rename the file.`;
  }
  return issue ? "The file has no name." : undefined;
};

// Stores an upload that `fileProblem` accepted. Pass the transaction that links it to its record.
export const saveFile = async (db: Db | Tx, { name, type, bytes }: Readonly<Upload>) => {
  const [file] = await db
    .insert(files)
    .values({ name: name.trim(), type, size: bytes.length, bytes })
    .returning(fileColumns);
  return file satisfies StoredFile;
};
