import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import {
  handbookPages,
  handbookReads,
  type NewPage,
  type Page,
  type PageUpdate,
  type Read,
} from "../db/schema/handbook.ts";
import { people } from "../db/schema/people.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// A page was changed since the caller loaded it.
export type Refusal = "changed";

// What a new project starts with. Edit for the project.
export const defaultPages: readonly Omit<NewPage, "actorId">[] = [
  {
    title: "Welcome",
    section: "Getting started",
    body: `This handbook holds the team's written knowledge: how things are done, and the policies everyone needs to read.

## Writing pages

Pages are written in Markdown. The editor shows a preview as you type.

- \`# Heading\` for a heading, \`**bold**\` and \`*italic*\` for emphasis
- \`- item\` or \`1. item\` for lists, \`> text\` for a quote
- \`[text](https://example.com)\` for a link

## Read tracking

Turn on "Ask people to confirm they have read it" for a policy. Each person then confirms the page, and the page lists who has not read its current version.`,
  },
];

// What the contents list needs, and every column but the search vector, which stays in the
// database.
const rowColumns = {
  id: handbookPages.id,
  title: handbookPages.title,
  section: handbookPages.section,
  position: handbookPages.position,
  trackReads: handbookPages.trackReads,
  version: handbookPages.version,
  updatedAt: handbookPages.updatedAt,
  updatedById: handbookPages.updatedById,
};
const pageColumns = { ...rowColumns, body: handbookPages.body };

// Writes that change positions take this lock, so they run one at a time and positions within a
// section stay 1, 2, 3 and so on. Reads are not blocked.
// ponytail: one lock for every page; lock per section if editors ever queue behind each other.
const lockPages = (tx: Tx) => tx.execute(sql`lock table ${handbookPages} in exclusive mode`);

const endOf = async (tx: Tx, section: string) => {
  const [{ last }] = await tx
    .select({ last: sql<number>`coalesce(max(${handbookPages.position}), 0)`.mapWith(Number) })
    .from(handbookPages)
    .where(eq(handbookPages.section, section));
  return last + 1;
};

const seedPages = (db: Db) =>
  db.transaction(async (tx) => {
    await lockPages(tx);
    const [{ total }] = await tx.select({ total: count() }).from(handbookPages);
    if (total > 0) return;
    for (const page of defaultPages) {
      await tx
        .insert(handbookPages)
        .values({ ...page, position: await endOf(tx, page.section ?? "") });
    }
  });

// Every page without its body, by section, then position. A database with none gets the default
// pages first.
export const listPages = async (db: Db) => {
  const [{ total }] = await db.select({ total: count() }).from(handbookPages);
  if (total === 0) await seedPages(db);
  return db
    .select(rowColumns)
    .from(handbookPages)
    .orderBy(asc(handbookPages.section), asc(handbookPages.position), asc(handbookPages.id));
};

// Pages whose title or body has every word in `query`, each word also matching as the start of
// a longer one, best match (title words count more) first. Only letters and digits are used, so
// nothing in the query is read as search syntax.
export const searchPages = async (
  db: Db,
  query: string
): Promise<readonly Pick<Page, "id" | "title" | "section">[]> => {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return [];
  const tsquery = sql`to_tsquery('english', ${words.map((word) => `${word}:*`).join(" & ")})`;
  return db
    .select({ id: handbookPages.id, title: handbookPages.title, section: handbookPages.section })
    .from(handbookPages)
    .where(sql`${handbookPages.search} @@ ${tsquery}`)
    .orderBy(desc(sql`ts_rank(${handbookPages.search}, ${tsquery})`), asc(handbookPages.id))
    .limit(50);
};

// A page with who last changed it and, for read tracking, every person with the version they
// last confirmed (null for never).
// ponytail: lists everyone in `approval_people`; filter to a team once there are teams.
export const getPage = async (db: Db, id: number) => {
  const [page] = await db
    .select({ ...pageColumns, updatedByName: people.name })
    .from(handbookPages)
    .leftJoin(people, eq(handbookPages.updatedById, people.id))
    .where(eq(handbookPages.id, id));
  if (!page) return undefined;
  const readers = await db
    .select({
      id: people.id,
      name: people.name,
      readVersion: handbookReads.version,
      readAt: handbookReads.readAt,
    })
    .from(people)
    .leftJoin(
      handbookReads,
      and(eq(handbookReads.personId, people.id), eq(handbookReads.pageId, id))
    )
    .orderBy(asc(people.name));
  return { ...page, readers };
};

export const createPage = (db: Db, { actorId, ...input }: Readonly<NewPage>) =>
  db.transaction(async (tx) => {
    await lockPages(tx);
    const section = input.section ?? "";
    const [page] = await tx
      .insert(handbookPages)
      .values({ ...input, section, position: await endOf(tx, section), updatedById: actorId })
      .returning(pageColumns);
    return page;
  });

// Saves an edit made from `version`. A change to the title or body starts a new version, so
// everyone confirms the page again; a page moved to another section goes to its end.
export const updatePage = (
  db: Db,
  { id, version, actorId, ...input }: Readonly<PageUpdate>
): Promise<Page | Refusal | undefined> =>
  db.transaction(async (tx) => {
    await lockPages(tx);
    const [page] = await tx.select().from(handbookPages).where(eq(handbookPages.id, id));
    if (!page) return undefined;
    if (page.version !== version) return "changed";
    const section = input.section ?? "";
    const body = input.body ?? "";
    const rewritten = input.title !== page.title || body !== page.body;
    const [saved] = await tx
      .update(handbookPages)
      .set({
        title: input.title,
        body,
        section,
        trackReads: input.trackReads ?? false,
        position: section === page.section ? page.position : await endOf(tx, section),
        version: rewritten ? version + 1 : version,
        updatedAt: new Date(),
        updatedById: actorId,
      })
      .where(eq(handbookPages.id, id))
      .returning(pageColumns);
    return saved;
  });

// Swaps a page with its neighbor in its section, then numbers the section 1, 2, 3 again so
// earlier gaps or ties are gone. Moving the first page up or the last down changes nothing.
export const movePage = (db: Db, id: number, direction: "up" | "down") =>
  db.transaction(async (tx) => {
    await lockPages(tx);
    const [page] = await tx.select(rowColumns).from(handbookPages).where(eq(handbookPages.id, id));
    if (!page) return undefined;
    const pages = await tx
      .select({ id: handbookPages.id })
      .from(handbookPages)
      .where(eq(handbookPages.section, page.section))
      .orderBy(asc(handbookPages.position), asc(handbookPages.id));
    const ids = pages.map((row) => row.id);
    const at = ids.indexOf(id);
    const to = direction === "up" ? at - 1 : at + 1;
    if (to >= 0 && to < ids.length) [ids[at], ids[to]] = [ids[to], ids[at]];
    for (const [index, pageId] of ids.entries()) {
      await tx
        .update(handbookPages)
        .set({ position: index + 1 })
        .where(eq(handbookPages.id, pageId));
    }
    return true;
  });

// Records that `actorId` has read `version` of a page. Refused when the page has moved on, so
// nobody confirms a version they were not shown. The page row is held so an edit waits.
export const confirmRead = (
  db: Db,
  { id, version, actorId }: Readonly<Read>
): Promise<true | Refusal | undefined> =>
  db.transaction(async (tx) => {
    const [page] = await tx
      .select({ version: handbookPages.version })
      .from(handbookPages)
      .where(eq(handbookPages.id, id))
      .for("share");
    if (!page) return undefined;
    if (page.version !== version) return "changed";
    await tx
      .insert(handbookReads)
      .values({ pageId: id, personId: actorId, version })
      .onConflictDoUpdate({
        target: [handbookReads.pageId, handbookReads.personId],
        set: { version, readAt: new Date() },
      });
    return true;
  });
