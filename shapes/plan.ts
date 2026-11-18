// Pure planning for `shape.ts`: which shapes stay, which files go, and what the
// three registries (backend router, backend routes, frontend pages) look like afterwards.

export type Shape = {
  readonly requires: readonly string[];
  readonly files: readonly string[];
  readonly routers: readonly {
    readonly key: string;
    readonly name: string;
    readonly from: string;
  }[];
  readonly pages: readonly {
    readonly path: string;
    readonly title: string;
    readonly name: string;
    readonly from: string;
  }[];
  // Views this shape adds to pages it does not own: a link shape's. `slot` names the place,
  // which the page exposes with <Slots name="..." id={...} />.
  readonly slots?: readonly {
    readonly slot: string;
    readonly name: string;
    readonly from: string;
  }[];
  // Fastify plugins for plain HTTP routes (file upload and download). Omitted when there are none.
  readonly routes?: readonly { readonly name: string; readonly from: string }[];
};

export type Shapes = Readonly<Record<string, Shape>>;

const duplicates = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];

// Mistakes in the manifests themselves. An empty list means they are usable.
export const problems = (shapes: Shapes): readonly string[] => {
  const all = Object.values(shapes);
  const unknown = Object.entries(shapes).flatMap(([name, shape]) =>
    shape.requires
      .filter((required) => !(required in shapes))
      .map((required) => `${name} requires ${required}, which is not a shape`)
  );
  const clashes = (label: string, values: readonly string[]) =>
    duplicates(values).map((value) => `${label} ${value} is claimed more than once`);
  return [
    ...unknown,
    ...clashes(
      "file",
      all.flatMap((shape) => shape.files)
    ),
    ...clashes(
      "router key",
      all.flatMap((shape) => shape.routers.map((router) => router.key))
    ),
    ...clashes(
      "page path",
      all.flatMap((shape) => shape.pages.map((page) => page.path))
    ),
    ...clashes(
      "routes",
      all.flatMap((shape) => (shape.routes ?? []).map((routes) => routes.name))
    ),
  ];
};

const hasPage = (shapes: Shapes, name: string) => shapes[name].pages.length > 0;

// A building block such as csv cannot make an app on its own: the frontend has nothing to show
// and, with no tables, the backend has no migration to run. A link shape has no page either, but
// the shapes it requires do, so it can be kept alone.
export const selectable = (shapes: Shapes): readonly string[] =>
  Object.keys(shapes).filter((name) => {
    try {
      resolve(shapes, [name]);
      return true;
    } catch {
      return false;
    }
  });

// The named shapes in the order given, each followed by whatever it requires.
export const resolve = (shapes: Shapes, names: readonly string[]): readonly string[] => {
  const kept: string[] = [];
  const visit = (name: string): void => {
    if (!(name in shapes)) {
      throw new Error(`${name} is not a shape. Shapes: ${Object.keys(shapes).join(", ")}`);
    }
    if (kept.includes(name)) return;
    kept.push(name);
    shapes[name].requires.forEach(visit);
  };
  names.forEach(visit);
  if (!kept.some((name) => hasPage(shapes, name))) {
    const users = Object.keys(shapes).filter(
      (name) =>
        hasPage(shapes, name) && names.some((named) => shapes[name].requires.includes(named))
    );
    throw new Error(
      `${names.join(", ")} has no page, so it cannot be kept alone. Keep a shape that requires it: ${users.join(", ")}`
    );
  }
  return kept;
};

export const filesToDelete = (shapes: Shapes, kept: readonly string[]): readonly string[] =>
  Object.entries(shapes)
    .filter(([name]) => !kept.includes(name))
    .flatMap(([, shape]) => shape.files);

// A recipe names the shapes a trade-specific app keeps, home page first. Everything else about
// the app (names, fields, links) is edits, described in its doc at `docs/recipes/<name>.md`.
export type Recipe = { readonly title: string; readonly shapes: readonly string[] };

export type Recipes = Readonly<Record<string, Recipe>>;

export const recipeDoc = (name: string): string => `docs/recipes/${name}.md`;

// Mistakes in the recipes. A recipe must make a project that `resolve` accepts; it may name a
// shape with no page (a link shape, say) as long as it also names one with a page.
export const recipeProblems = (shapes: Shapes, recipes: Recipes): readonly string[] =>
  Object.entries(recipes).flatMap(([name, recipe]) => {
    const unknown = recipe.shapes.filter((shape) => !(shape in shapes));
    const found = [
      ...(recipe.shapes.length === 0 ? [`recipe ${name} names no shapes`] : []),
      ...unknown.map((shape) => `recipe ${name} names ${shape}, which is not a shape`),
      ...duplicates(recipe.shapes).map((shape) => `recipe ${name} names ${shape} more than once`),
    ];
    if (found.length > 0) return found;
    try {
      resolve(shapes, recipe.shapes);
      return [];
    } catch (error) {
      return [`recipe ${name}: ${error instanceof Error ? error.message : String(error)}`];
    }
  });

export const recipeShapes = (recipes: Recipes, name: string): readonly string[] => {
  if (!(name in recipes)) {
    throw new Error(`${name} is not a recipe. Recipes: ${Object.keys(recipes).join(", ")}`);
  }
  return recipes[name].shapes;
};

// A project made from a recipe keeps that recipe's doc, since it lists the edits still to make.
export const recipeDocsToDelete = (recipes: Recipes, kept?: string): readonly string[] =>
  Object.keys(recipes)
    .filter((name) => name !== kept)
    .map(recipeDoc);

type Import = { readonly name: string; readonly from: string; readonly typeOnly?: boolean };

const importLines = (imports: readonly Import[]): string =>
  imports
    .toSorted((a, b) => a.from.localeCompare(b.from))
    .map(
      ({ name, from, typeOnly }) => `import ${typeOnly ? "type " : ""}{ ${name} } from "${from}";`
    )
    .join("\n");

export const renderRouter = (shapes: Shapes, kept: readonly string[]): string => {
  const routers = kept.flatMap((name) => shapes[name].routers);
  return `${importLines([...routers, { name: "router", from: "./trpc.ts" }])}

// One sub-router per feature.
export const appRouter = router({
${routers.map(({ key, name }) => `  ${key}: ${name},`).join("\n")}
});

export type AppRouter = typeof appRouter;
`;
};

export const renderRoutes = (shapes: Shapes, kept: readonly string[]): string => {
  const routes = kept.flatMap((name) => shapes[name].routes ?? []);
  return `${importLines([
    ...routes,
    { name: "Db", from: "./db/client.ts", typeOnly: true },
    { name: "FastifyPluginAsync", from: "fastify", typeOnly: true },
  ])}

// One Fastify plugin per feature that serves plain HTTP, registered under /api. Everything else
// goes through the tRPC router.
export const routes: readonly FastifyPluginAsync<{ readonly db: Db }>[] = [
${routes.map(({ name }) => `  ${name},`).join("\n")}
];
`;
};

export const renderPages = (shapes: Shapes, kept: readonly string[]): string => {
  const pages = kept.flatMap((name) => shapes[name].pages);
  const slots = kept.flatMap((name) => shapes[name].slots ?? []);
  const slotEntries = slots.map(
    ({ slot, name }) => `  { slot: ${JSON.stringify(slot)}, Component: ${name} },\n`
  );
  return `${importLines([...pages, ...slots, { name: "Page, Slot", from: "./App.tsx", typeOnly: true }])}

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
${pages.map(({ path, title, name }) => `  { path: ${JSON.stringify(path)}, title: ${JSON.stringify(title)}, Component: ${name} },`).join("\n")}
];

// One entry per view a shape adds to a page it does not own, rendered by <Slots> on that page.
export const slots: readonly Slot[] = ${slots.length === 0 ? "[]" : `[\n${slotEntries.join("")}]`};
`;
};
