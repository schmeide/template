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
import { DealRequests } from "./dealRequests/DealRequests.tsx";
import { RequestDealLink } from "./dealRequests/DealRequests.tsx";
import { Deals } from "./deals/Deals.tsx";
import { Directory } from "./directory/Directory.tsx";
import { PeriodDues } from "./dues/Dues.tsx";
import { InvoicePeriod } from "./dues/Dues.tsx";
import { Handbook } from "./handbook/Handbook.tsx";
import { CustomerIntakes } from "./intakes/CustomerIntakes.tsx";
import { Intake } from "./intakes/Intake.tsx";
import { Invoices } from "./invoices/Invoices.tsx";
import { Quotes } from "./invoices/Quotes.tsx";
import { Leases } from "./leases/Leases.tsx";
import { RequestLeave } from "./leave/Leave.tsx";
import { AccountLeave } from "./leave/Leave.tsx";
import { Members } from "./membership/Members.tsx";
import { Notes } from "./notes/Notes.tsx";
import { OrderInvoice } from "./orderInvoices/OrderInvoice.tsx";
import { InvoiceOrder } from "./orderInvoices/OrderInvoice.tsx";
import { Orders } from "./orders/Orders.tsx";
import { Shop } from "./orders/Shop.tsx";
import { ProductStock } from "./orderStock/OrderStock.tsx";
import { OrderFulfillment } from "./orderStock/OrderStock.tsx";
import { BillRent } from "./rentCharges/RentCharges.tsx";
import { LeaseCharges } from "./rentCharges/RentCharges.tsx";
import { InvoiceRent } from "./rentCharges/RentCharges.tsx";
import { RequestCustomer } from "./requestCustomers/RequestCustomer.tsx";
import { CustomerRequests } from "./requestCustomers/RequestCustomer.tsx";
import { RequestDeal } from "./requestDeals/RequestDeal.tsx";
import { DealSource } from "./requestDeals/RequestDeal.tsx";
import { Requests } from "./requests/Requests.tsx";
import { RequestUnit } from "./requestUnits/RequestUnits.tsx";
import { UnitRequests } from "./requestUnits/RequestUnits.tsx";
import { Stock } from "./stock/Stock.tsx";
import { DealVisits } from "./visits/Visits.tsx";
import { BookingDeal } from "./visits/Visits.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
  { path: "assets", title: "Assets", Component: Assets },
  { path: "bookings", title: "Bookings", Component: Bookings },
  { path: "book", title: "Book online", Component: BookOnline },
  { path: "intake", title: "Intake forms", Component: Intake },
  { path: "customers", title: "Customers", Component: Customers },
  { path: "dashboard", title: "Dashboard", Component: Dashboard },
  { path: "deals", title: "Deals", Component: Deals },
  { path: "directory", title: "Staff", Component: Directory },
  { path: "handbook", title: "Handbook", Component: Handbook },
  { path: "invoices", title: "Invoices", Component: Invoices },
  { path: "quotes", title: "Quotes", Component: Quotes },
  { path: "rent", title: "Bill rent", Component: BillRent },
  { path: "leases", title: "Leases", Component: Leases },
  { path: "members", title: "Members", Component: Members },
  { path: "notes", title: "Notes", Component: Notes },
  { path: "orders", title: "Orders", Component: Orders },
  { path: "shop", title: "Shop", Component: Shop },
  { path: "requests", title: "Requests", Component: Requests },
  { path: "stock", title: "Stock", Component: Stock },
];

// One entry per view a shape adds to a page it does not own, rendered by <Slots> on that page.
export const slots: readonly Slot[] = [
  { slot: "customer", Component: CustomerIntakes },
  { slot: "deal", Component: DealAccount },
  { slot: "account", Component: AccountDeal },
  { slot: "deal", Component: DealVisits },
  { slot: "booking", Component: BookingDeal },
  { slot: "deal", Component: DealDocuments },
  { slot: "deal", Component: DealRequests },
  { slot: "request", Component: RequestDealLink },
  { slot: "account", Component: AccountBilling },
  { slot: "lease", Component: LeaseCharges },
  { slot: "invoice", Component: InvoiceRent },
  { slot: "request", Component: RequestLeave },
  { slot: "account", Component: AccountLeave },
  { slot: "period", Component: PeriodDues },
  { slot: "invoice", Component: InvoicePeriod },
  { slot: "order", Component: OrderInvoice },
  { slot: "invoice", Component: InvoiceOrder },
  { slot: "product", Component: ProductStock },
  { slot: "order-fulfillment", Component: OrderFulfillment },
  { slot: "quote", Component: QuoteConversion },
  { slot: "invoice", Component: InvoiceSource },
  { slot: "request", Component: RequestCustomer },
  { slot: "customer", Component: CustomerRequests },
  { slot: "request", Component: RequestDeal },
  { slot: "deal", Component: DealSource },
  { slot: "request", Component: RequestUnit },
  { slot: "asset", Component: UnitRequests },
];
