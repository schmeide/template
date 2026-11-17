import type { Page } from "./App.tsx";
import { Notes } from "./notes/Notes.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [{ path: "notes", title: "Notes", Component: Notes }];
