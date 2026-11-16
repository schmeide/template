import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./db/client.ts";

// Applies backend/drizzle to DATABASE_URL. Runs on the host (`make db/migrate`)
// and as the one-shot `migrate` service in Compose, so it needs no dev dependencies.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env or run via `make db/migrate`.");
  process.exit(1);
}

const db = createDb(databaseUrl);
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await db.$client.end();
console.log("Migrations applied.");
