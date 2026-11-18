// Pure planning for `shape.ts`: which shapes stay, which files go, and what the
// two registries (backend router, frontend pages) look like afterwards.

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
  ];
};

// A shape with no page (a building block such as csv) cannot make an app on its own: the frontend
// has nothing to show and, with no tables, the backend has no migration to run.
export const selectable = (shapes: Shapes): readonly string[] =>
  Object.keys(shapes).filter((name) => shapes[name].pages.length > 0);

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
  if (!kept.some((name) => shapes[name].pages.length > 0)) {
    const users = selectable(shapes).filter((name) =>
      names.some((named) => shapes[name].requires.includes(named))
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

export const renderPages = (shapes: Shapes, kept: readonly string[]): string => {
  const pages = kept.flatMap((name) => shapes[name].pages);
  return `${importLines([...pages, { name: "Page", from: "./App.tsx", typeOnly: true }])}

// One entry per page, in menu order. The first is the home page.
export const pages: readonly Page[] = [
${pages.map(({ path, title, name }) => `  { path: ${JSON.stringify(path)}, title: ${JSON.stringify(title)}, Component: ${name} },`).join("\n")}
];
`;
};
