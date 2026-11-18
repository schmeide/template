import type { Page, Slot } from "./App.tsx";
import { Assets } from "./assets/Assets.tsx";
import { AccountBilling } from "./billing/Billing.tsx";
import { Bookings } from "./bookings/Bookings.tsx";
import { BookOnline } from "./bookings/BookOnline.tsx";
import { QuoteConversion } from "./conversions/Conversion.tsx";
import { InvoiceSource } from "./conversions/Conversion.tsx";
import { Customers } from "./customers/Customers.tsx";
import { Dashboard } from "./dashboard/Dashboard.tsx";
import { DealAccount } from "./dealAccounts/DealAccount.tsx";
import { AccountDeal } from "./dealAccounts/DealAccount.tsx";
import { DealDocuments } from "./dealDocuments/DealDocuments.tsx";
import { Deals } from "./deals/Deals.tsx";
import { Handbook } from "./handbook/Handbook.tsx";
import { Invoices } from "./invoices/Invoices.tsx";
import { Quotes } from "./invoices/Quotes.tsx";
import { Notes } from "./notes/Notes.tsx";
import { Orders } from "./orders/Orders.tsx";
import { Shop } from "./orders/Shop.tsx";
import { RequestDeal } from "./requestDeals/RequestDeal.tsx";
import { DealSource } from "./requestDeals/RequestDeal.tsx";
import { Requests } from "./requests/Requests.tsx";
import { Stock } from "./stock/Stock.tsx";
import { DealVisits } from "./visits/Visits.tsx";
import { BookingDeal } from "./visits/Visits.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
  { path: "assets", title: "Assets", Component: Assets },
  { path: "bookings", title: "Bookings", Component: Bookings },
  { path: "book", title: "Book online", Component: BookOnline },
  { path: "customers", title: "Customers", Component: Customers },
  { path: "dashboard", title: "Dashboard", Component: Dashboard },
  { path: "deals", title: "Deals", Component: Deals },
  { path: "handbook", title: "Handbook", Component: Handbook },
  { path: "invoices", title: "Invoices", Component: Invoices },
  { path: "quotes", title: "Quotes", Component: Quotes },
  { path: "notes", title: "Notes", Component: Notes },
  { path: "orders", title: "Orders", Component: Orders },
  { path: "shop", title: "Shop", Component: Shop },
  { path: "requests", title: "Requests", Component: Requests },
  { path: "stock", title: "Stock", Component: Stock },
];

// One entry per view a shape adds to a page it does not own, rendered by <Slots> on that page.
export const slots: readonly Slot[] = [
  { slot: "deal", Component: DealAccount },
  { slot: "account", Component: AccountDeal },
  { slot: "deal", Component: DealVisits },
  { slot: "booking", Component: BookingDeal },
  { slot: "deal", Component: DealDocuments },
  { slot: "account", Component: AccountBilling },
  { slot: "quote", Component: QuoteConversion },
  { slot: "invoice", Component: InvoiceSource },
  { slot: "request", Component: RequestDeal },
  { slot: "deal", Component: DealSource },
];
