import { assetsRouter } from "./routers/assets.ts";
import { bookingsRouter } from "./routers/bookings.ts";
import { customersRouter } from "./routers/customers.ts";
import { dashboardRouter } from "./routers/dashboard.ts";
import { dealsRouter } from "./routers/deals.ts";
import { handbookRouter } from "./routers/handbook.ts";
import { invoicesRouter } from "./routers/invoices.ts";
import { notesRouter } from "./routers/notes.ts";
import { ordersRouter } from "./routers/orders.ts";
import { peopleRouter } from "./routers/people.ts";
import { requestsRouter } from "./routers/requests.ts";
import { stockRouter } from "./routers/stock.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  assets: assetsRouter,
  bookings: bookingsRouter,
  customers: customersRouter,
  dashboard: dashboardRouter,
  deals: dealsRouter,
  handbook: handbookRouter,
  invoices: invoicesRouter,
  notes: notesRouter,
  orders: ordersRouter,
  people: peopleRouter,
  requests: requestsRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
