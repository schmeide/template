import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import type { AppRouter } from "../../backend/src/router.ts";
import { App } from "./App.tsx";
import { pages, slots } from "./pages.ts";
import { TRPCProvider } from "./trpc.ts";

const queryClient = new QueryClient();
const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <App pages={pages} slots={slots} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>
);
