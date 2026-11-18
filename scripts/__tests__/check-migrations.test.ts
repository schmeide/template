import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMigrations, checkSql } from "../check-migrations.ts";

const FILE = "backend/drizzle/0008_change.sql";
const BREAK = "--> statement-breakpoint\n";

describe("checkSql allows additions", () => {
  it.each([
    ["an enum", `CREATE TYPE "public"."color" AS ENUM('red', 'green');`],
    [
      "a table with inline constraints",
      `CREATE TABLE "widgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"color" "color" DEFAULT 'red' NOT NULL,
	CONSTRAINT "widgets_name_unique" UNIQUE("name"),
	CONSTRAINT "widgets_name_check" CHECK ("widgets"."name" <> '')
);`,
    ],
    [
      "an index on an existing table",
      `CREATE INDEX "notes_body_index" ON "notes" USING btree ("body");`,
    ],
    [
      "a GIN index on an existing table",
      `CREATE INDEX IF NOT EXISTS "notes_search_index" ON "public"."notes" USING gin ("search");`,
    ],
    [
      "a unique index on a table created in the same migration",
      `CREATE TABLE "tags" ("id" serial PRIMARY KEY NOT NULL, "name" text NOT NULL);
${BREAK}CREATE UNIQUE INDEX "tags_name_key" ON "tags" USING btree (lower("name"));`,
    ],
    ["a nullable column", `ALTER TABLE "notes" ADD COLUMN "title" varchar(200);`],
    [
      "a NOT NULL column with a default",
      `ALTER TABLE "notes" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;`,
    ],
    [
      "a generated column",
      `ALTER TABLE "notes" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "notes"."body")) STORED NOT NULL;`,
    ],
    ["a serial column", `ALTER TABLE "notes" ADD COLUMN "position" serial NOT NULL;`],
    ["an enum value", `ALTER TYPE "public"."color" ADD VALUE 'blue';`],
    [
      "an enum value with a position",
      `ALTER TYPE "color" ADD VALUE IF NOT EXISTS 'blue' BEFORE 'green';`,
    ],
    [
      "a foreign key from a new table to an existing table",
      `CREATE TABLE "comments" ("id" serial PRIMARY KEY NOT NULL, "note_id" integer NOT NULL);
${BREAK}ALTER TABLE "comments" ADD CONSTRAINT "comments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;`,
    ],
    [
      "a foreign key on a column added in the same migration",
      `ALTER TABLE "notes" ADD COLUMN "author_id" integer;${BREAK}ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;`,
    ],
    [
      "an inline foreign key on a new column",
      `ALTER TABLE "notes" ADD COLUMN "author_id" integer REFERENCES "people"("id");`,
    ],
    [
      "a check on a table created in the same migration",
      `CREATE TABLE "prices" ("amount" integer);${BREAK}ALTER TABLE "prices" ADD CONSTRAINT "prices_positive" CHECK ("prices"."amount" > 0);`,
    ],
    [
      "unquoted, lowercase and multi-line statements with comments",
      `-- a new table
create table if not exists public.labels (
  id serial primary key, /* nested /* comment */ still a comment */
  text varchar(100) default 'a; DROP TABLE notes' not null,
  note text default $body$x; DROP TABLE notes$body$,
  escaped text default E'it\\'s; DROP TABLE notes'
);`,
    ],
    ["a file of only comments", `-- nothing to do\n`],
  ])("allows %s", (_name, sql) => {
    expect(checkSql(FILE, sql)).toEqual([]);
  });
});

describe("checkSql refuses changes", () => {
  it.each([
    ["a dropped table", `DROP TABLE "notes";`, "removes"],
    [
      "a Drizzle-generated rename, which is a drop plus an add",
      `ALTER TABLE "notes" DROP COLUMN "body";${BREAK}ALTER TABLE "notes" ADD COLUMN "text" varchar(500);`,
      "drops a column",
    ],
    ["a renamed column", `ALTER TABLE "notes" RENAME COLUMN "body" TO "text";`, "renames a column"],
    ["a renamed table", `ALTER TABLE "notes" RENAME TO "memos";`, "renames a table"],
    [
      "a renamed constraint",
      `ALTER TABLE "notes" RENAME CONSTRAINT "a" TO "b";`,
      "renames a constraint",
    ],
    ["a dropped constraint", `ALTER TABLE "notes" DROP CONSTRAINT "a";`, "drops a constraint"],
    [
      "a renamed enum value",
      `ALTER TYPE "public"."color" RENAME VALUE 'red' TO 'crimson';`,
      "changes an enum",
    ],
    ["a dropped enum", `DROP TYPE "public"."color";`, "removes"],
    [
      "a changed type",
      `ALTER TABLE "notes" ALTER COLUMN "body" SET DATA TYPE text;`,
      "changes a column's type",
    ],
    [
      "a changed type (short form)",
      `ALTER TABLE "notes" ALTER "body" TYPE text USING "body"::text;`,
      "changes a column's type",
    ],
    [
      "SET NOT NULL",
      `ALTER TABLE "notes" ALTER COLUMN "title" SET NOT NULL;`,
      "makes a column NOT NULL",
    ],
    [
      "DROP NOT NULL",
      `ALTER TABLE "notes" ALTER COLUMN "body" DROP NOT NULL;`,
      "lets a column hold NULL",
    ],
    [
      "SET DEFAULT",
      `ALTER TABLE "notes" ALTER COLUMN "body" SET DEFAULT '';`,
      "changes a column's default",
    ],
    [
      "DROP DEFAULT",
      `ALTER TABLE "notes" ALTER COLUMN "body" DROP DEFAULT;`,
      "changes a column's default",
    ],
    [
      "a NOT NULL column without a default",
      `ALTER TABLE "notes" ADD COLUMN "title" varchar(200) NOT NULL;`,
      "NOT NULL column without a default",
    ],
    [
      "a foreign key on an existing column",
      `ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fk" FOREIGN KEY ("author_id") REFERENCES "people"("id");`,
      "already existed",
    ],
    [
      "a check on an existing table",
      `ALTER TABLE "notes" ADD CONSTRAINT "notes_body_check" CHECK ("notes"."body" <> '');`,
      "already existed",
    ],
    [
      "a check on a column added in the same migration",
      `ALTER TABLE "notes" ADD COLUMN "n" integer;${BREAK}ALTER TABLE "notes" ADD CONSTRAINT "c" CHECK ("n" > 0);`,
      "already existed",
    ],
    [
      "a unique constraint on an existing table",
      `ALTER TABLE "notes" ADD CONSTRAINT "notes_body_unique" UNIQUE("body");`,
      "already existed",
    ],
    [
      "a unique constraint on a column added in the same migration",
      `ALTER TABLE "notes" ADD COLUMN "slug" text;${BREAK}ALTER TABLE "notes" ADD CONSTRAINT "notes_slug_unique" UNIQUE("slug");`,
      "already existed",
    ],
    [
      "an inline unique constraint on a new column of an existing table",
      `ALTER TABLE "notes" ADD COLUMN "slug" text DEFAULT '' NOT NULL UNIQUE;`,
      "already existed",
    ],
    [
      "a unique index on an existing table",
      `CREATE UNIQUE INDEX "notes_body_key" ON "notes" USING btree ("body");`,
      "unique index",
    ],
    [
      "a constraint on a table that IF NOT EXISTS may not have created",
      `CREATE TABLE IF NOT EXISTS "notes" ("id" serial);${BREAK}ALTER TABLE "notes" ADD CONSTRAINT "c" CHECK (true);`,
      "already existed",
    ],
    ["an UPDATE", `UPDATE "notes" SET "body" = '';`, "changes data"],
    ["a DELETE", `DELETE FROM "notes";`, "changes data"],
    ["a TRUNCATE", `TRUNCATE "notes";`, "changes data"],
    ["an INSERT", `INSERT INTO "notes" ("body") VALUES ('x');`, "changes data"],
    [
      "a DO block",
      `DO $$ BEGIN CREATE TABLE "x" (); DROP TABLE "notes"; END $$;`,
      "does not recognize",
    ],
    ["a DROP hidden after a comment", `/* create */ -- harmless\nDROP TABLE "notes";`, "removes"],
    [
      "two statements on one line",
      `CREATE INDEX "i" ON "notes" ("body"); DROP TABLE "notes";`,
      "removes",
    ],
    [
      "an ALTER TABLE with a forbidden action among several",
      `ALTER TABLE "notes" ADD COLUMN "a" text, DROP COLUMN "body";`,
      "drops a column",
    ],
    ["CREATE TABLE AS", `CREATE TABLE "copy" AS SELECT * FROM "notes";`, "does not recognize"],
    ["an unrecognized statement", `GRANT ALL ON "notes" TO public;`, "does not recognize"],
    ["an unterminated string", `CREATE TABLE "x" ("a" text DEFAULT 'oops);`, "could not read"],
  ])("refuses %s", (_name, sql, reason) => {
    const found = checkSql(FILE, sql);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(FILE);
    expect(found[0]).toContain(reason);
    expect(found[0]).toContain("Instead:");
  });
});

const journal = (tags: readonly string[], when: (i: number) => number = (i) => 1000 + i) =>
  JSON.stringify({
    version: "7",
    dialect: "postgresql",
    entries: tags.map((tag, idx) => ({
      idx,
      version: "7",
      when: when(idx),
      tag,
      breakpoints: true,
    })),
  });

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const project = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), "check-migrations-"));
  dirs.push(root);
  write(root, files);
  return root;
};

const write = (root: string, files: Readonly<Record<string, string>>) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
};

// Commits the tree with plumbing, so no hooks, signing or user config are involved.
const commit = (root: string) => {
  const git = (...args: readonly string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    }).trim();
  git("init", "-q");
  git("add", "-A");
  return git("commit-tree", git("write-tree"), "-m", "base");
};

const base = {
  "backend/drizzle/meta/_journal.json": journal(["0000_init", "0001_add"]),
  "backend/drizzle/meta/0000_snapshot.json": "{}",
  "backend/drizzle/0000_init.sql": `CREATE TABLE "notes" ("id" serial);`,
  "backend/drizzle/0001_add.sql": `ALTER TABLE "notes" ADD COLUMN "body" text;`,
};

describe("checkMigrations against BASE", () => {
  it("accepts a new additive migration that is not committed yet", () => {
    const root = project(base);
    const sha = commit(root);
    write(root, {
      "backend/drizzle/meta/_journal.json": journal(["0000_init", "0001_add", "0002_more"]),
      "backend/drizzle/0002_more.sql": `CREATE INDEX "i" ON "notes" ("body");`,
    });

    expect(checkMigrations(root, sha)).toEqual([]);
  });

  it("refuses a new migration that breaks the rule, naming its file", () => {
    const root = project(base);
    const sha = commit(root);
    write(root, {
      "backend/drizzle/meta/_journal.json": journal(["0000_init", "0001_add", "0002_more"]),
      "backend/drizzle/0002_more.sql": `ALTER TABLE "notes" DROP COLUMN "body";`,
    });

    const found = checkMigrations(root, sha);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("backend/drizzle/0002_more.sql");
    expect(found[0]).toContain("drops a column");
  });

  it("refuses a change to a migration that existed at BASE", () => {
    const root = project(base);
    const sha = commit(root);
    write(root, { "backend/drizzle/0001_add.sql": `ALTER TABLE "notes" ADD COLUMN "text" text;` });

    const found = checkMigrations(root, sha);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("backend/drizzle/0001_add.sql was changed");
  });

  it("refuses a deleted snapshot that existed at BASE", () => {
    const root = project(base);
    const sha = commit(root);
    rmSync(join(root, "backend/drizzle/meta/0000_snapshot.json"));

    const found = checkMigrations(root, sha);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("backend/drizzle/meta/0000_snapshot.json was deleted");
  });

  it("refuses a reordered journal", () => {
    const root = project(base);
    const sha = commit(root);
    write(root, { "backend/drizzle/meta/_journal.json": journal(["0001_add", "0000_init"]) });

    const found = checkMigrations(root, sha);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("journal");
  });

  it("refuses a new migration dated before the ones at BASE", () => {
    const root = project(base);
    const sha = commit(root);
    write(root, {
      "backend/drizzle/meta/_journal.json": journal(["0000_init", "0001_add", "0002_more"], (i) =>
        i === 2 ? 1 : 1000 + i
      ),
      "backend/drizzle/0002_more.sql": `CREATE INDEX "i" ON "notes" ("body");`,
    });

    const found = checkMigrations(root, sha);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("0002_more");
    expect(found[0]).toContain("make db/generate");
  });

  it("explains a BASE that is not in this clone", () => {
    const root = project(base);
    commit(root);

    expect(() => checkMigrations(root, "0123456789abcdef0123456789abcdef01234567")).toThrow(
      /git fetch/
    );
  });

  it("explains a BASE outside a git repository", () => {
    const root = project(base);

    expect(() => checkMigrations(root, "main")).toThrow(/not a git repository/);
  });
});

describe("checkMigrations without BASE", () => {
  it("checks every migration after 0000 without git", () => {
    const root = project({
      "backend/drizzle/meta/_journal.json": journal(["0000_init", "0001_add"]),
      "backend/drizzle/0000_init.sql": `DROP TABLE "anything";`,
      "backend/drizzle/0001_add.sql": `ALTER TABLE "notes" DROP COLUMN "body";`,
    });

    const found = checkMigrations(root);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("backend/drizzle/0001_add.sql");
  });
});
