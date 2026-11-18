import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import {
  filesToDelete,
  problems,
  recipeDoc,
  recipeDocsToDelete,
  recipeProblems,
  recipeShapes,
  renderPages,
  renderRouter,
  renderRoutes,
  resolve,
  selectable,
  type Recipe,
  type Recipes,
  type Shape,
  type Shapes,
} from "./plan.ts";

// Run through the Makefile (`make shape/...`), which also formats and migrates.
const usage =
  "Usage: node shapes/shape.ts list | recipes | registries | keep <name...> | recipe <name>";
const root = dirname(import.meta.dirname);
const at = (path: string) => join(root, path);

const fail = (lines: readonly string[]): never => {
  console.error(lines.join("\n"));
  process.exit(1);
};

// Reads every `<name><suffix>` file in shapes/ into a record keyed by name, sorted by name.
const load = <T>(suffix: string): Readonly<Record<string, T>> =>
  Object.fromEntries(
    readdirSync(import.meta.dirname)
      .filter((file) => file.endsWith(suffix))
      .toSorted()
      .map((file) => [
        basename(file, suffix),
        JSON.parse(readFileSync(join(import.meta.dirname, file), "utf8")) as T,
      ])
  );

const shapes: Shapes = load<Shape>(".shape.json");
const recipes: Recipes = load<Recipe>(".recipe.json");

const missing = Object.entries(shapes).flatMap(([name, shape]) =>
  shape.files
    .filter((file) => !existsSync(at(file)))
    .map((file) => `${name} lists ${file}, which does not exist`)
);
const missingDocs = Object.keys(recipes)
  .filter((name) => !existsSync(at(recipeDoc(name))))
  .map((name) => `recipe ${name} has no doc: write ${recipeDoc(name)}`);
const found = [...problems(shapes), ...missing, ...recipeProblems(shapes, recipes), ...missingDocs];
if (found.length > 0) fail(found);

const writeRegistries = (kept: readonly string[]) => {
  writeFileSync(at("backend/src/router.ts"), renderRouter(shapes, kept));
  writeFileSync(at("backend/src/routes.ts"), renderRoutes(shapes, kept));
  writeFileSync(at("frontend/src/pages.ts"), renderPages(shapes, kept));
};

// Removes a shape's file or directory, then any directory that leaves empty.
const remove = (file: string) => {
  rmSync(at(file), { recursive: true });
  for (let dir = dirname(at(file)); readdirSync(dir).length === 0; dir = dirname(dir)) {
    rmdirSync(dir);
  }
};

// Keeps the named shapes and what they require, and the doc of the recipe they came from, if any.
const keep = (names: readonly string[], recipe?: string) => {
  let kept: readonly string[] = [];
  try {
    kept = resolve(shapes, names);
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
  [...filesToDelete(shapes, kept), ...recipeDocsToDelete(recipes, recipe)].forEach(remove);
  writeRegistries(kept);
  // A project starts with one migration for the tables it kept; the Makefile generates it.
  rmSync(at("backend/drizzle"), { recursive: true, force: true });
  rmSync(import.meta.dirname, { recursive: true });
  console.log(`Kept: ${kept.join(", ")}`);
};

const [command, ...names] = process.argv.slice(2);

// `list` names the shapes that can be kept alone; `shape/check` checks each of them, and a
// building block is checked through the shapes that require it. `recipes` prints one recipe per
// line: its name, a tab, then its title and shapes.
if (command === "list") {
  console.log(selectable(shapes).join("\n"));
} else if (command === "registries") {
  writeRegistries(Object.keys(shapes));
} else if (command === "recipes") {
  Object.entries(recipes).forEach(([name, recipe]) =>
    console.log(`${name}\t${recipe.title}: ${recipe.shapes.join(" ")}`)
  );
} else if (command === "keep" && names.length > 0) {
  keep(names);
} else if (command === "recipe" && names.length === 1) {
  let named: readonly string[] = [];
  try {
    named = recipeShapes(recipes, names[0]);
  } catch (error) {
    fail([
      error instanceof Error ? error.message : String(error),
      "Run make shape/recipes to see what each one keeps.",
    ]);
  }
  keep(named, names[0]);
} else {
  fail([usage]);
}
