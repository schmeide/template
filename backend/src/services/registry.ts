import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  importLimits,
  newRecordSchema,
  recordStatus,
  registryCategories,
  registryRecords,
  type Category,
  type Filter,
  type NewRecord,
  type PageRequest,
  type RecordUpdate,
  type RegistryRecord,
} from "../db/schema/registry.ts";
import { CsvError, parseCsv, toCsv } from "./csv.ts";

// A new register starts with these. Edit for the project.
const defaultCategories = ["Computers", "Phones", "Furniture", "Vehicles", "Tools"];

// Every category by name. An empty table gets the defaults first; a migration cannot seed them,
// because a project's migrations are regenerated.
export const listCategories = async (db: Db): Promise<readonly Category[]> => {
  const [{ total }] = await db.select({ total: count() }).from(registryCategories);
  if (total === 0) {
    await db
      .insert(registryCategories)
      .values(defaultCategories.map((name) => ({ name })))
      .onConflictDoNothing();
  }
  return db.select().from(registryCategories).orderBy(asc(registryCategories.name));
};

// "duplicate" when another category has the name, ignoring case.
export const createCategory = async (
  db: Db,
  input: { readonly name: string }
): Promise<Category | "duplicate"> => {
  const [category] = await db
    .insert(registryCategories)
    .values(input)
    .onConflictDoNothing()
    .returning();
  return category ?? "duplicate";
};

export const createRecord = async (db: Db, input: Readonly<NewRecord>): Promise<RegistryRecord> => {
  const [record] = await db.insert(registryRecords).values(input).returning();
  return record;
};

// A record with its category's name.
const listed = { ...getTableColumns(registryRecords), category: registryCategories.name };

export const getRecord = async (db: Db, id: number) => {
  const [record] = await db
    .select(listed)
    .from(registryRecords)
    .leftJoin(registryCategories, eq(registryRecords.categoryId, registryCategories.id))
    .where(eq(registryRecords.id, id));
  return record;
};

// Saves every field; one left out goes back to its default.
export const updateRecord = async (
  db: Db,
  { id, ...input }: Readonly<RecordUpdate>
): Promise<RegistryRecord | undefined> => {
  const [record] = await db
    .update(registryRecords)
    .set({
      name: input.name,
      tag: input.tag ?? "",
      categoryId: input.categoryId ?? null,
      status: input.status ?? "in_use",
      owner: input.owner ?? "",
      expiresOn: input.expiresOn ?? null,
      notes: input.notes ?? "",
    })
    .where(eq(registryRecords.id, id))
    .returning();
  return record;
};

const setArchived = async (db: Db, id: number, archived: boolean) => {
  const [record] = await db
    .update(registryRecords)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(registryRecords.id, id))
    .returning();
  return record;
};

// Archived records leave the default list but keep their status, so restoring brings them back
// as they were. There is no hard delete.
export const archiveRecord = (db: Db, id: number) => setArchived(db, id, true);
export const restoreRecord = (db: Db, id: number) => setArchived(db, id, false);

// ILIKE treats % and _ as wildcards and \ as their escape.
const contains = (text: string) => `%${text.replaceAll(/[\\%_]/g, "\\$&")}%`;

const matching = ({ search, categoryId, status, expiring }: Readonly<Filter>) =>
  and(
    status === "archived"
      ? isNotNull(registryRecords.archivedAt)
      : isNull(registryRecords.archivedAt),
    status && status !== "archived" ? eq(registryRecords.status, status) : undefined,
    categoryId === undefined ? undefined : eq(registryRecords.categoryId, categoryId),
    // ponytail: a substring search cannot use a btree index, so it scans every row, which is fine
    // into the tens of thousands. Past that, add a trigram index (the pg_trgm extension), which a
    // generated migration cannot create.
    search
      ? or(
          ilike(registryRecords.name, contains(search)),
          ilike(registryRecords.tag, contains(search)),
          ilike(registryRecords.owner, contains(search)),
          ilike(registryRecords.notes, contains(search))
        )
      : undefined,
    expiring
      ? lte(registryRecords.expiresOn, sql`${expiring.today}::date + ${expiring.days}::int`)
      : undefined
  );

// The sort column, then id so equal values keep one order across pages. Records with no date
// come last both ways (Postgres puts nulls last going up and first going down).
const ordering = ({ sort = "name", descending = false }: Readonly<Filter>) => {
  const column = registryRecords[sort];
  if (!descending) return [asc(column), asc(registryRecords.id)];
  return [
    sort === "expiresOn" ? sql`${column} desc nulls last` : desc(column),
    desc(registryRecords.id),
  ];
};

const select = (db: Db, filter: Readonly<Filter>) =>
  db
    .select(listed)
    .from(registryRecords)
    .leftJoin(registryCategories, eq(registryRecords.categoryId, registryCategories.id))
    .where(matching(filter))
    .orderBy(...ordering(filter));

// One page of the records matching the filter, and how many match in all.
// ponytail: offset paging reads every skipped row, fine for hundreds of pages; switch to keyset
// paging (after the last row's sort value and id) if people page that deep.
export const listRecords = async (
  db: Db,
  { page = 1, pageSize = 50, ...filter }: Readonly<PageRequest>
) => {
  const [rows, [{ total }]] = await Promise.all([
    select(db, filter)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(registryRecords).where(matching(filter)),
  ]);
  return { rows, total };
};

// The columns of an export, and of an import, which matches them ignoring case.
const columns = {
  name: "Name",
  tag: "Tag",
  categoryId: "Category",
  status: "Status",
  owner: "Owner",
  expiresOn: "Expires",
  notes: "Notes",
} as const;
type Column = keyof typeof columns;
const order = Object.keys(columns) as readonly Column[];

// Every record matching the filter, in the list's order, as CSV.
export const exportRecords = async (db: Db, filter: Readonly<Filter>): Promise<string> => {
  const rows = await select(db, filter);
  return toCsv([
    Object.values(columns),
    ...rows.map((row) => [
      row.name,
      row.tag,
      row.category,
      row.status,
      row.owner,
      row.expiresOn,
      row.notes,
    ]),
  ]);
};

export type ImportCheck = {
  // Rows that would be imported.
  readonly ready: number;
  // Header cells that name no column.
  readonly ignored: readonly string[];
  // Row numbers count the header as row 1, as a spreadsheet shows them.
  readonly problems: readonly { readonly row: number; readonly messages: readonly string[] }[];
};

const statusNames = recordStatus.enumValues.map((status) => status.replaceAll("_", " "));

// Wording for the cells people most often get wrong; anything else keeps the schema's message.
const hints: Partial<Record<Column, string>> = {
  status: `Use one of ${statusNames.join(", ")}.`,
  expiresOn: "Use a date written as YYYY-MM-DD.",
};

const refuse = (row: number, message: string) => ({
  records: [],
  check: { ready: 0, ignored: [], problems: [{ row, messages: [message] }] },
});

const parse = (csv: string) => {
  try {
    return parseCsv(csv);
  } catch (error) {
    if (error instanceof CsvError) return error;
    throw error;
  }
};

// Parses a CSV file and validates every row with the same schema as the create form. Empty rows
// are skipped. A category is matched by name ignoring case; an unknown one is a problem, not a
// new category, so a typo cannot add one.
const checkImport = async (
  db: Db,
  csv: string
): Promise<{ readonly records: readonly NewRecord[]; readonly check: ImportCheck }> => {
  const rows = parse(csv);
  if (rows instanceof CsvError) return refuse(rows.row, rows.message);
  const [header, ...body] = rows;
  if (!header) return refuse(1, "The file is empty.");
  const keys = header.map((cell) =>
    order.find((key) => columns[key].toLowerCase() === cell.trim().toLowerCase())
  );
  if (!keys.includes("name")) {
    return refuse(1, "The first row must name the columns and include Name.");
  }
  if (body.length > importLimits.rows) {
    return refuse(
      importLimits.rows + 2,
      `A file can hold at most ${importLimits.rows} rows. Split it and import each part.`
    );
  }
  const categories = new Map(
    (await db.select().from(registryCategories)).map(({ id, name }) => [name.toLowerCase(), id])
  );
  const checked = body
    .map((cells, index) => ({ row: index + 2, cells }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""))
    .map(({ row, cells }) => {
      const cell = (key: Column) => (cells[keys.indexOf(key)] ?? "").trim();
      const category = cell("categoryId");
      const categoryId = category === "" ? null : categories.get(category.toLowerCase());
      const optional = (key: Column) => cell(key) || undefined;
      const parsed = newRecordSchema.safeParse({
        name: cell("name"),
        tag: optional("tag"),
        categoryId,
        status: optional("status")?.toLowerCase().replaceAll(/\s+/g, "_"),
        owner: optional("owner"),
        expiresOn: cell("expiresOn") || null,
        notes: optional("notes"),
      });
      // In column order. A new array, so sorting in place is safe; the frontend's ES2022 lib,
      // which also checks this file, has no toSorted.
      const issues = [
        ...(categoryId === undefined
          ? [
              {
                key: "categoryId" as const,
                message: `No category is named “${category}”. Add it first or leave the cell empty.`,
              },
            ]
          : []),
        ...(parsed.error?.issues ?? []).map((issue) => {
          const key = issue.path[0] as Column;
          return { key, message: hints[key] ?? issue.message };
        }),
      ].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      return {
        row,
        record: issues.length === 0 ? parsed.data : undefined,
        messages: issues.map(({ key, message }) => `${columns[key]}: ${message}`),
      };
    });
  const records = checked.flatMap(({ record }) => (record ? [record] : []));
  return {
    records,
    check: {
      ready: records.length,
      ignored: header.filter((cell, index) => keys[index] === undefined && cell.trim() !== ""),
      problems: checked
        .filter(({ messages }) => messages.length > 0)
        .map(({ row, messages }) => ({ row, messages })),
    },
  };
};

export const previewImport = async (db: Db, csv: string): Promise<ImportCheck> =>
  (await checkImport(db, csv)).check;

// Checks the file again rather than trusting a preview, then imports every row or, if any row has
// a problem, none: fix the file and import it again, with no duplicates to clean up.
export const commitImport = async (
  db: Db,
  csv: string
): Promise<ImportCheck & { readonly imported: number }> => {
  const { records, check } = await checkImport(db, csv);
  if (check.problems.length > 0 || records.length === 0) return { ...check, imported: 0 };
  await db.insert(registryRecords).values([...records]);
  return { ...check, imported: records.length };
};
