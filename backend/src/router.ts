import { bookingsRouter } from "./routers/bookings.ts";
import { customersRouter } from "./routers/customers.ts";
import { dealsRouter } from "./routers/deals.ts";
import { invoicesRouter } from "./routers/invoices.ts";
import { notesRouter } from "./routers/notes.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  bookings: bookingsRouter,
  customers: customersRouter,
  deals: dealsRouter,
  invoices: invoicesRouter,
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
