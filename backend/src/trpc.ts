import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Db } from "./db/client.ts";

// `ip` is the client's address, for per-visitor limits; absent when a test or script calls in.
export type Context = { readonly db: Db; readonly ip?: string };

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const procedure = t.procedure;
