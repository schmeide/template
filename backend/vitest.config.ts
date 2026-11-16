import { defineConfig } from "vitest/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run `make test` to start a throwaway Postgres, or point DATABASE_URL at a migrated database."
  );
}

export default defineConfig({
  test: {
    name: "backend",
    environment: "node",
    include: ["src/**/__tests__/*.test.ts"],
  },
});
