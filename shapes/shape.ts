import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import {
  filesToDelete,
  problems,
  renderPages,
  renderRouter,
  resolve,
  type Shape,
  type Shapes,
} from "./plan.ts";

// Usage: node shapes/shape.ts list | registries | keep <name...>
// Run through the Makefile (`make shape/...`), which also formats and migrates.
const root = dirname(import.meta.dirname);
const at = (path: string) => join(root, path);

const fail = (lines: readonly string[]): never => {
  console.error(lines.join("\n"));
  process.exit(1);
};

const shapes: Shapes = Object.fromEntries(
  readdirSync(import.meta.dirname)
    .filter((file) => file.endsWith(".shape.json"))
    .toSorted()
    .map((file) => [
      basename(file, ".shape.json"),
      JSON.parse(readFileSync(join(import.meta.dirname, file), "utf8")) as Shape,
    ])
);

const missing = Object.entries(shapes).flatMap(([name, shape]) =>
  shape.files
    .filter((file) => !existsSync(at(file)))
    .map((file) => `${name} lists ${file}, which does not exist`)
);
const found = [...problems(shapes), ...missing];
if (found.length > 0) fail(found);

const writeRegistries = (kept: readonly string[]) => {
  writeFileSync(at("backend/src/router.ts"), renderRouter(shapes, kept));
  writeFileSync(at("frontend/src/pages.ts"), renderPages(shapes, kept));
};

// Removes a shape's file or directory, then any directory that leaves empty.
const remove = (file: string) => {
  rmSync(at(file), { recursive: true });
  for (let dir = dirname(at(file)); readdirSync(dir).length === 0; dir = dirname(dir)) {
    rmdirSync(dir);
  }
};

const [command, ...names] = process.argv.slice(2);

if (command === "list") {
  console.log(Object.keys(shapes).join("\n"));
} else if (command === "registries") {
  writeRegistries(Object.keys(shapes));
} else if (command === "keep" && names.length > 0) {
  let kept: readonly string[] = [];
  try {
    kept = resolve(shapes, names);
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
  filesToDelete(shapes, kept).forEach(remove);
  writeRegistries(kept);
  // A project starts with one migration for the tables it kept; the Makefile generates it.
  rmSync(at("backend/drizzle"), { recursive: true, force: true });
  rmSync(import.meta.dirname, { recursive: true });
  console.log(`Kept: ${kept.join(", ")}`);
} else {
  fail(["Usage: node shapes/shape.ts list | registries | keep <name...>"]);
}
