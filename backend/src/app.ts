import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import type { Db } from "./db/client.ts";
import { appRouter } from "./router.ts";

export const buildApp = (db: Db, logger = false) => {
  const app = Fastify({ logger });
  app.get("/healthz", async () => ({ ok: true }));
  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: { router: appRouter, createContext: () => ({ db }) },
  });
  return app;
};
