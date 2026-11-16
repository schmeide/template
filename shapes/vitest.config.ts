import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "shapes", environment: "node", include: ["__tests__/*.test.ts"] },
});
