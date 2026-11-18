import type { Page } from "./App.tsx";
import { Customers } from "./customers/Customers.tsx";
import { Deals } from "./deals/Deals.tsx";
import { Invoices } from "./invoices/Invoices.tsx";
import { Notes } from "./notes/Notes.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
  { path: "customers", title: "Customers", Component: Customers },
  { path: "deals", title: "Deals", Component: Deals },
  { path: "invoices", title: "Invoices", Component: Invoices },
  { path: "notes", title: "Notes", Component: Notes },
];
