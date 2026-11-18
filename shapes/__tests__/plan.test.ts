import { describe, expect, it } from "vitest";
import {
  filesToDelete,
  problems,
  recipeDocsToDelete,
  recipeProblems,
  recipeShapes,
  renderPages,
  renderRouter,
  resolve,
  selectable,
  type Recipes,
  type Shape,
  type Shapes,
} from "../plan.ts";

const shape = (name: string, requires: readonly string[] = []): Shape => ({
  requires,
  files: [`backend/src/services/${name}.ts`, `frontend/src/${name}/`],
  routers: [{ key: name, name: `${name}Router`, from: `./routers/${name}.ts` }],
  pages: [
    { path: name, title: name.toUpperCase(), name: `${name}Page`, from: `./${name}/Page.tsx` },
  ],
});

const shapes: Shapes = {
  customers: shape("customers"),
  invoices: shape("invoices", ["customers"]),
  notes: shape("notes"),
  portal: shape("portal", ["invoices"]),
};

// A building block: code other shapes require, with no page of its own.
const csv: Shape = { requires: [], files: ["backend/src/services/csv.ts"], routers: [], pages: [] };
const withCsv: Shapes = { ...shapes, csv, stock: shape("stock", ["csv"]) };

describe("resolve", () => {
  it("keeps the named shapes in the order given, then what they require", () => {
    expect(resolve(shapes, ["notes", "portal"])).toEqual([
      "notes",
      "portal",
      "invoices",
      "customers",
    ]);
  });

  it("keeps a shape once when it is both named and required", () => {
    expect(resolve(shapes, ["customers", "invoices"])).toEqual(["customers", "invoices"]);
  });

  it("rejects a name that is not a shape and lists the real ones", () => {
    expect(() => resolve(shapes, ["invoice"])).toThrow(
      "invoice is not a shape. Shapes: customers, invoices, notes, portal"
    );
  });

  it("keeps a building block when a shape that requires it is named", () => {
    expect(resolve(withCsv, ["csv", "stock"])).toEqual(["csv", "stock"]);
  });

  it("rejects a building block kept alone and names the shapes that require it", () => {
    expect(() => resolve(withCsv, ["csv"])).toThrow(
      "csv has no page, so it cannot be kept alone. Keep a shape that requires it: stock"
    );
  });
});

describe("selectable", () => {
  it("lists the shapes that have a page, leaving out building blocks", () => {
    expect(selectable(withCsv)).toEqual(["customers", "invoices", "notes", "portal", "stock"]);
  });
});

describe("filesToDelete", () => {
  it("lists the files of every shape that is not kept", () => {
    expect(filesToDelete(shapes, ["invoices", "customers"])).toEqual([
      "backend/src/services/notes.ts",
      "frontend/src/notes/",
      "backend/src/services/portal.ts",
      "frontend/src/portal/",
    ]);
  });
});

describe("problems", () => {
  it("finds none in sound manifests", () => {
    expect(problems(shapes)).toEqual([]);
  });

  it("reports an unknown requirement and anything claimed twice", () => {
    const broken: Shapes = {
      notes: shape("notes", ["missing"]),
      copy: { ...shape("notes"), requires: [] },
    };

    expect(problems(broken)).toEqual([
      "notes requires missing, which is not a shape",
      "file backend/src/services/notes.ts is claimed more than once",
      "file frontend/src/notes/ is claimed more than once",
      "router key notes is claimed more than once",
      "page path notes is claimed more than once",
    ]);
  });
});

describe("renderRouter", () => {
  it("nests one sub-router per kept shape", () => {
    expect(renderRouter(shapes, ["invoices", "customers"]))
      .toBe(`import { customersRouter } from "./routers/customers.ts";
import { invoicesRouter } from "./routers/invoices.ts";
import { router } from "./trpc.ts";

// One sub-router per feature.
export const appRouter = router({
  invoices: invoicesRouter,
  customers: customersRouter,
});

export type AppRouter = typeof appRouter;
`);
  });
});

describe("renderPages", () => {
  it("lists the pages of kept shapes in menu order", () => {
    expect(renderPages(shapes, ["invoices", "customers"]))
      .toBe(`import type { Page } from "./App.tsx";
import { customersPage } from "./customers/Page.tsx";
import { invoicesPage } from "./invoices/Page.tsx";

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
  { path: "invoices", title: "INVOICES", Component: invoicesPage },
  { path: "customers", title: "CUSTOMERS", Component: customersPage },
];
`);
  });
});

const recipes: Recipes = {
  billing: { title: "Billing", shapes: ["invoices", "notes"] },
  // A shape with no page may be named alongside one that has a page (a link shape, say).
  shop: { title: "Shop", shapes: ["stock", "csv"] },
};

describe("recipeShapes", () => {
  it("returns the recipe's shapes in its order", () => {
    expect(recipeShapes(recipes, "billing")).toEqual(["invoices", "notes"]);
  });

  it("rejects a name that is not a recipe and lists the real ones", () => {
    expect(() => recipeShapes(recipes, "bill")).toThrow(
      "bill is not a recipe. Recipes: billing, shop"
    );
  });
});

describe("recipeProblems", () => {
  it("finds none in sound recipes", () => {
    expect(recipeProblems(withCsv, recipes)).toEqual([]);
  });

  it("reports a recipe with no shapes, an unknown shape, a repeat, and no page", () => {
    const broken: Recipes = {
      empty: { title: "Empty", shapes: [] },
      odd: { title: "Odd", shapes: ["invoice", "notes", "notes"] },
      blocks: { title: "Blocks", shapes: ["csv"] },
    };

    expect(recipeProblems(withCsv, broken)).toEqual([
      "recipe empty names no shapes",
      "recipe odd names invoice, which is not a shape",
      "recipe odd names notes more than once",
      "recipe blocks: csv has no page, so it cannot be kept alone. Keep a shape that requires it: stock",
    ]);
  });
});

describe("recipeDocsToDelete", () => {
  it("keeps the doc of the recipe a project was made from", () => {
    expect(recipeDocsToDelete(recipes, "shop")).toEqual(["docs/recipes/billing.md"]);
  });

  it("deletes every recipe doc when a project was made from names", () => {
    expect(recipeDocsToDelete(recipes)).toEqual([
      "docs/recipes/billing.md",
      "docs/recipes/shop.md",
    ]);
  });
});
