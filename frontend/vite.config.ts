/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One config for the dev server, the build, and Vitest. The dev server proxies
// /api to the backend so the browser sees a single origin, as nginx does in Compose.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT ?? "5173"),
    strictPort: true,
    proxy: { "/api": `http://localhost:${process.env.PORT ?? "3000"}` },
  },
  test: {
    name: "frontend",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/*.test.tsx"],
  },
});
