import { assetsRouter } from "./routers/assets.ts";
import { bookingsRouter } from "./routers/bookings.ts";
import { customersRouter } from "./routers/customers.ts";
import { dealsRouter } from "./routers/deals.ts";
import { invoicesRouter } from "./routers/invoices.ts";
import { notesRouter } from "./routers/notes.ts";
import { ordersRouter } from "./routers/orders.ts";
import { requestsRouter } from "./routers/requests.ts";
import { stockRouter } from "./routers/stock.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  assets: assetsRouter,
  bookings: bookingsRouter,
  customers: customersRouter,
  deals: dealsRouter,
  invoices: invoicesRouter,
  notes: notesRouter,
  orders: ordersRouter,
  requests: requestsRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
