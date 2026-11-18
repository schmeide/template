import { assetsRouter } from "./routers/assets.ts";
import { billingRouter } from "./routers/billing.ts";
import { bookingsRouter } from "./routers/bookings.ts";
import { conversionsRouter } from "./routers/conversions.ts";
import { customersRouter } from "./routers/customers.ts";
import { dashboardRouter } from "./routers/dashboard.ts";
import { dealAccountsRouter } from "./routers/dealAccounts.ts";
import { dealDocumentsRouter } from "./routers/dealDocuments.ts";
import { dealRequestsRouter } from "./routers/dealRequests.ts";
import { dealsRouter } from "./routers/deals.ts";
import { directoryRouter } from "./routers/directory.ts";
import { handbookRouter } from "./routers/handbook.ts";
import { intakesRouter } from "./routers/intakes.ts";
import { invoicesRouter } from "./routers/invoices.ts";
import { quotesRouter } from "./routers/invoices.ts";
import { leaveRouter } from "./routers/leave.ts";
import { notesRouter } from "./routers/notes.ts";
import { ordersRouter } from "./routers/orders.ts";
import { orderStockRouter } from "./routers/orderStock.ts";
import { peopleRouter } from "./routers/people.ts";
import { requestDealsRouter } from "./routers/requestDeals.ts";
import { requestsRouter } from "./routers/requests.ts";
import { stockRouter } from "./routers/stock.ts";
import { visitsRouter } from "./routers/visits.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  assets: assetsRouter,
  bookings: bookingsRouter,
  intakes: intakesRouter,
  customers: customersRouter,
  dashboard: dashboardRouter,
  dealAccounts: dealAccountsRouter,
  visits: visitsRouter,
  dealDocuments: dealDocumentsRouter,
  dealRequests: dealRequestsRouter,
  deals: dealsRouter,
  directory: directoryRouter,
  billing: billingRouter,
  handbook: handbookRouter,
  invoices: invoicesRouter,
  quotes: quotesRouter,
  leave: leaveRouter,
  notes: notesRouter,
  orderStock: orderStockRouter,
  orders: ordersRouter,
  people: peopleRouter,
  conversions: conversionsRouter,
  requestDeals: requestDealsRouter,
  requests: requestsRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
