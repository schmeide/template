import type { Page } from "./App.tsx";
import { Bookings } from "./bookings/Bookings.tsx";
import { BookOnline } from "./bookings/BookOnline.tsx";
import { Customers } from "./customers/Customers.tsx";
import { Deals } from "./deals/Deals.tsx";
import { Invoices } from "./invoices/Invoices.tsx";
import { Notes } from "./notes/Notes.tsx";
import { Requests } from "./requests/Requests.tsx";
import { Stock } from "./stock/Stock.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
  { path: "bookings", title: "Bookings", Component: Bookings },
  { path: "book", title: "Book online", Component: BookOnline },
  { path: "customers", title: "Customers", Component: Customers },
  { path: "deals", title: "Deals", Component: Deals },
  { path: "invoices", title: "Invoices", Component: Invoices },
  { path: "notes", title: "Notes", Component: Notes },
  { path: "requests", title: "Requests", Component: Requests },
  { path: "stock", title: "Stock", Component: Stock },
];
