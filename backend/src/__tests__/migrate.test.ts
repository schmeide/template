import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client.ts";

// Everything lives in its own Postgres schema, migrations table included, so the
// shared test database is left as it was.
const schema = `migrate_test_${randomUUID().replaceAll("-", "")}`;
const db = createDb(process.env.DATABASE_URL ?? "");
const dirs: string[] = [];

afterAll(async () => {
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  await db.$client.end();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const migrations = [
  {
    tag: "0000_create",
    sql: `CREATE TABLE "${schema}"."widgets" ("id" serial PRIMARY KEY, "name" text NOT NULL);`,
  },
  {
    tag: "0001_add",
    sql: `ALTER TABLE "${schema}"."widgets" ADD COLUMN "color" text DEFAULT 'red' NOT NULL;`,
  },
] as const;

// Writes a migrations folder holding the first `count` migrations, as one version of the app has it.
const version = (count: number) => {
  const folder = mkdtempSync(join(tmpdir(), "migrate-test-"));
  dirs.push(folder);
  mkdirSync(join(folder, "meta"));
  const kept = migrations.slice(0, count);
  kept.forEach(({ tag, sql: text }) => writeFileSync(join(folder, `${tag}.sql`), text));
  const entries = kept.map(({ tag }, idx) => ({
    idx,
    version: "7",
    when: 1000 + idx,
    tag,
    breakpoints: true,
  }));
  writeFileSync(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries })
  );
  return folder;
};

const run = (folder: string) =>
  migrate(db, {
    migrationsFolder: folder,
    migrationsSchema: schema,
    migrationsTable: "migrations",
  });

const applied = async () =>
  (await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${schema}"."migrations"`))).rows[0]?.n;

describe("Drizzle's migrator", () => {
  it("applies nothing for an older version and leaves the newer schema as it stands", async () => {
    await run(version(2));
    expect(await applied()).toBe(2);

    await run(version(1));

    expect(await applied()).toBe(2);
    const columns = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'widgets' ORDER BY column_name`
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(["color", "id", "name"]);
    // Older code knows only id and name; its writes and reads still work.
    await db.execute(sql.raw(`INSERT INTO "${schema}"."widgets" ("name") VALUES ('old')`));
    const rows = await db.execute(sql.raw(`SELECT "id", "name" FROM "${schema}"."widgets"`));
    expect(rows.rows.map((row) => row.name)).toEqual(["old"]);
  });
});
