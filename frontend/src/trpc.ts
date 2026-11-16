import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../backend/src/router.ts";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
