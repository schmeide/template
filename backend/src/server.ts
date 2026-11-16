import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env or run via `make serve`.");
  process.exit(1);
}

const app = buildApp(createDb(databaseUrl), true);

// Node as PID 1 in a container ignores SIGTERM unless handled.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close());
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
