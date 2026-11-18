import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyRequest } from "fastify";
import type { Db } from "./db/client.ts";
import { appRouter } from "./router.ts";
import { routes } from "./routes.ts";

export const buildApp = (db: Db, logger = false) => {
  const app = Fastify({ logger });
  // /healthz for the container probe, /api/healthz for checks through the web proxy.
  for (const url of ["/healthz", "/api/healthz"]) {
    app.get(url, async () => ({ ok: true }));
  }
  app.register(fastifyTRPCPlugin, {
    prefix: "/api/trpc",
    trpcOptions: {
      router: appRouter,
      // nginx sets X-Real-IP to the address it saw, replacing any the client sent. The backend has
      // no published port, so only nginx reaches it in the stack.
      // ponytail: behind another proxy (the platform's edge) every visitor shares that proxy's
      // address; read the edge's forwarded header then.
      createContext: ({ req }: { readonly req: FastifyRequest }) => ({
        db,
        ip: String(req.headers["x-real-ip"] ?? req.ip),
      }),
    },
  });
  // The few features that serve plain HTTP (file upload and download), each in its own plugin.
  for (const plugin of routes) app.register(plugin, { prefix: "/api", db });
  return app;
};
