import type { Db } from "./db/client.ts";
import { assetsRoutes } from "./routes/assets.ts";
import type { FastifyPluginAsync } from "fastify";

// One Fastify plugin per feature that serves plain HTTP, registered under /api. Everything else
// goes through the tRPC router.
export const routes: readonly FastifyPluginAsync<{ readonly db: Db }>[] = [assetsRoutes];
