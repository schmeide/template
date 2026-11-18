import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

// Checks that migrations only add to the database, so an older version of the app
// still runs against it. The rule and what to do instead are in AGENTS.md
// ("Database changes"). Run through `make check/migrations`.

const USAGE = `Usage: node scripts/check-migrations.ts [BASE]

Checks that migrations under backend/drizzle only add to the database.

  BASE   a commit: check the migrations added since it (committed or not) and
         refuse any change to a migration file that existed at it.
         Without BASE, check every migration after 0000 (no git needed).

Exits 1 when a migration breaks the rule, 2 when the check cannot run.`;

const DRIZZLE = "backend/drizzle";
const JOURNAL = `${DRIZZLE}/meta/_journal.json`;

const ADD_INSTEAD =
  "add a new column or table, write code that uses it (copying from the old one when reading), and leave the old one in place";
const CODE_INSTEAD = "enforce it in the code (the Zod schema or the service) instead";

type Token = {
  readonly kind: "word" | "quoted" | "string" | "number" | "punct";
  readonly text: string; // words lowercased, quoted identifiers unquoted
  readonly start: number;
  readonly end: number;
};

type Refusal = { readonly reason: string; readonly instead: string };

class Unreadable extends Error {}

// Splits SQL into tokens, dropping comments and whitespace. Strings, quoted
// identifiers and dollar-quoted bodies are single tokens, so a `;` or keyword
// inside them is never read as SQL.
const tokenize = (sql: string): readonly Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  const closing = (end: string, from: number, what: string) => {
    const at = sql.indexOf(end, from);
    if (at < 0) throw new Unreadable(`an unterminated ${what}`);
    return at + end.length;
  };
  while (i < sql.length) {
    const c = sql[i] ?? "";
    const start = i;
    if (/\s/.test(c)) {
      i++;
    } else if (sql.startsWith("--", i)) {
      i = sql.indexOf("\n", i) < 0 ? sql.length : sql.indexOf("\n", i);
    } else if (sql.startsWith("/*", i)) {
      let depth = 0;
      do {
        if (i >= sql.length) throw new Unreadable("an unterminated /* comment");
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      } while (depth > 0);
    } else if (c === "'" || ((c === "e" || c === "E") && sql[i + 1] === "'")) {
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      for (;;) {
        if (i >= sql.length) throw new Unreadable("an unterminated string");
        if (escapes && sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
      tokens.push({ kind: "string", text: sql.slice(start, i), start, end: i });
    } else if (c === '"') {
      i = start;
      do i = closing('"', i + 1, "quoted name");
      while (sql[i] === '"');
      tokens.push({
        kind: "quoted",
        text: sql.slice(start + 1, i - 1).replaceAll('""', '"'),
        start,
        end: i,
      });
    } else if (c === "$" && /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0] ?? "$$";
      i = closing(tag, i + tag.length, "dollar-quoted string");
      tokens.push({ kind: "string", text: sql.slice(start, i), start, end: i });
    } else if (/[A-Za-z_\u0080-￿]/.test(c)) {
      while (i < sql.length && /[A-Za-z0-9_$\u0080-￿]/.test(sql[i] ?? "")) i++;
      tokens.push({ kind: "word", text: sql.slice(start, i).toLowerCase(), start, end: i });
    } else if (/[0-9]/.test(c)) {
      while (i < sql.length && /[0-9.]/.test(sql[i] ?? "")) i++;
      tokens.push({ kind: "number", text: sql.slice(start, i), start, end: i });
    } else {
      i++;
      tokens.push({ kind: "punct", text: c, start, end: i });
    }
  }
  return tokens;
};

const isWord = (token: Token | undefined, ...words: readonly string[]) =>
  token?.kind === "word" && words.includes(token.text);
const isPunct = (token: Token | undefined, text: string) =>
  token?.kind === "punct" && token.text === text;
const isName = (token: Token | undefined) => token?.kind === "word" || token?.kind === "quoted";

// Splits tokens at a top-level separator (`;` between statements, `,` between ALTER TABLE actions).
const splitAt = (tokens: readonly Token[], separator: string): readonly (readonly Token[])[] => {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (isPunct(token, "(")) depth++;
    if (isPunct(token, ")")) depth--;
    if (depth === 0 && isPunct(token, separator)) parts.push([]);
    else parts.at(-1)?.push(token);
  }
  return parts.filter((part) => part.length > 0);
};

// Reads a possibly schema-qualified name at `at`; `public` is the default schema.
const readName = (tokens: readonly Token[], at: number) => {
  if (!isName(tokens[at])) return undefined;
  if (isPunct(tokens[at + 1], ".") && isName(tokens[at + 2])) {
    const schema = tokens[at]?.text;
    const name = tokens[at + 2]?.text ?? "";
    return { name: schema === "public" ? name : `${schema}.${name}`, next: at + 3 };
  }
  return { name: tokens[at]?.text ?? "", next: at + 1 };
};

const skipIfNotExists = (tokens: readonly Token[], at: number) =>
  isWord(tokens[at], "if") && isWord(tokens[at + 1], "not") && isWord(tokens[at + 2], "exists")
    ? at + 3
    : at;

// Index of the parenthesis that closes the one at `at`.
const closeOf = (tokens: readonly Token[], at: number) => {
  let depth = 0;
  for (let i = at; i < tokens.length; i++) {
    if (isPunct(tokens[i], "(")) depth++;
    if (isPunct(tokens[i], ")") && --depth === 0) return i;
  }
  return -1;
};

const hasWords = (tokens: readonly Token[], ...words: readonly string[]) =>
  tokens.some((_, at) => words.every((word, offset) => isWord(tokens[at + offset], word)));

const UNRECOGNIZED: Refusal = {
  reason:
    "this check does not recognize the statement, so it cannot tell whether older versions still work",
  instead:
    "use only what `make db/generate` writes for a new table, column, index, enum or enum value; see “Database changes” in AGENTS.md",
};

const CONSTRAINT_ON_EXISTING: Refusal = {
  reason:
    "it adds a constraint to a table or column that already existed, which its rows or older versions may break",
  instead: `${CODE_INSTEAD}, or put the constraint on a new table created in this migration`,
};

// What a file has created so far: tables and table.column keys. Constraints may
// only go on these.
type Created = { readonly tables: Set<string>; readonly columns: Set<string> };

const refuseAlterTableAction = (
  table: string,
  action: readonly Token[],
  created: Created
): Refusal | undefined => {
  const [verb, second] = action;
  if (isWord(verb, "add")) {
    const kind = isWord(second, "constraint") ? action[3] : second;
    if (isWord(kind, "foreign", "check", "unique", "primary", "exclude")) {
      if (created.tables.has(table)) return undefined;
      // A foreign key on columns this file added is fine. Others are allowed only on a new
      // table: a unique or check constraint on a new column still judges the old rows.
      const open = action.findIndex((token) => isPunct(token, "("));
      const close = action.findIndex((token) => isPunct(token, ")"));
      const columns = action.slice(open + 1, close).filter(isName);
      const onNewColumns =
        isWord(kind, "foreign") &&
        open > 0 &&
        columns.length > 0 &&
        columns.every((column) => created.columns.has(`${table}.${column.text}`));
      return onNewColumns ? undefined : CONSTRAINT_ON_EXISTING;
    }
    let at = isWord(second, "column") ? 2 : 1;
    const ifNotExists = skipIfNotExists(action, at) !== at;
    at = skipIfNotExists(action, at);
    const column = action[at];
    if (!isName(column) || !isName(action[at + 1])) return UNRECOGNIZED;
    const rest = action.slice(at + 1);
    const constrained =
      hasWords(rest, "unique") ||
      hasWords(rest, "check") ||
      hasWords(rest, "exclude") ||
      hasWords(rest, "primary", "key");
    if (constrained && !created.tables.has(table)) return CONSTRAINT_ON_EXISTING;
    const notNull = hasWords(rest, "not", "null") || hasWords(rest, "primary", "key");
    const filled =
      hasWords(rest, "default") ||
      hasWords(rest, "generated") ||
      isWord(rest[0], "serial", "smallserial", "bigserial", "serial2", "serial4", "serial8");
    if (notNull && !filled) {
      return {
        reason:
          "it adds a NOT NULL column without a default, so older versions can no longer insert rows",
        instead: "give the column a DEFAULT, or make it nullable and require the value in the code",
      };
    }
    // ADD COLUMN IF NOT EXISTS may have found an old column, so it does not count as new.
    if (!ifNotExists) created.columns.add(`${table}.${column?.text}`);
    return undefined;
  }
  if (isWord(verb, "drop")) {
    if (isWord(second, "constraint"))
      return { reason: "it drops a constraint", instead: CODE_INSTEAD };
    return {
      reason: "it drops a column that older versions still read and write",
      instead: ADD_INSTEAD,
    };
  }
  if (isWord(verb, "rename")) {
    const what = isWord(second, "to")
      ? "table"
      : isWord(second, "constraint")
        ? "constraint"
        : "column";
    return {
      reason: `it renames a ${what}, and older versions still use the old name`,
      instead: ADD_INSTEAD,
    };
  }
  if (isWord(verb, "alter")) {
    const change = action.slice(isWord(second, "column") ? 3 : 2);
    if (isWord(change[0], "type") || hasWords(change, "set", "data", "type")) {
      return {
        reason: "it changes a column's type, which older versions rely on",
        instead: ADD_INSTEAD,
      };
    }
    if (hasWords(change, "set", "not", "null")) {
      return {
        reason:
          "it makes a column NOT NULL, so older versions that leave it empty can no longer write",
        instead: `leave the column nullable and ${CODE_INSTEAD}`,
      };
    }
    if (hasWords(change, "drop", "not", "null")) {
      return {
        reason: "it lets a column hold NULL, which older versions assume never happens",
        instead: "add a new nullable column for the new values and leave this one as it is",
      };
    }
    if (hasWords(change, "set", "default") || hasWords(change, "drop", "default")) {
      return {
        reason: "it changes a column's default, which changes what older versions write",
        instead: "set the value in the code, or add a new column with the default you want",
      };
    }
  }
  return UNRECOGNIZED;
};

// Returns why a statement is refused, or undefined when it only adds. Records what it creates.
const refuseStatement = (tokens: readonly Token[], created: Created): Refusal | undefined => {
  const [first, second, third] = tokens;
  if (isWord(first, "drop")) {
    return { reason: "it removes something older versions may still use", instead: ADD_INSTEAD };
  }
  if (isWord(first, "update", "delete", "truncate", "insert", "merge", "copy")) {
    return {
      reason: "it changes data, and this rule allows migrations only to add to the schema",
      instead: "change data from the application code (a service function), not from a migration",
    };
  }
  if (isWord(first, "create") && isWord(second, "type")) {
    const type = readName(tokens, 2);
    const ok =
      type &&
      isWord(tokens[type.next], "as") &&
      isWord(tokens[type.next + 1], "enum") &&
      isPunct(tokens[type.next + 2], "(") &&
      closeOf(tokens, type.next + 2) === tokens.length - 1;
    return ok ? undefined : UNRECOGNIZED;
  }
  if (isWord(first, "create") && isWord(second, "table")) {
    const ifNotExists = skipIfNotExists(tokens, 2) !== 2;
    const table = readName(tokens, skipIfNotExists(tokens, 2));
    if (
      !table ||
      !isPunct(tokens[table.next], "(") ||
      closeOf(tokens, table.next) !== tokens.length - 1
    ) {
      return UNRECOGNIZED;
    }
    // IF NOT EXISTS may have found an old table, so it does not count as new.
    if (!ifNotExists) created.tables.add(table.name);
    return undefined;
  }
  if (
    isWord(first, "create") &&
    (isWord(second, "index") || (isWord(second, "unique") && isWord(third, "index")))
  ) {
    const unique = isWord(second, "unique");
    let at = unique ? 3 : 2;
    if (isWord(tokens[at], "concurrently")) at++;
    at = skipIfNotExists(tokens, at);
    if (!isWord(tokens[at], "on")) at = readName(tokens, at)?.next ?? at;
    if (!isWord(tokens[at], "on")) return UNRECOGNIZED;
    if (isWord(tokens[at + 1], "only")) at++;
    const table = readName(tokens, at + 1);
    if (!table) return UNRECOGNIZED;
    if (unique && !created.tables.has(table.name)) {
      return {
        reason:
          "it adds a unique index to a table that already existed, which can fail on its rows and constrains what older versions write",
        instead: `${CODE_INSTEAD}, or put the unique index on a new table created in this migration`,
      };
    }
    return undefined;
  }
  if (isWord(first, "alter") && isWord(second, "type")) {
    const type = readName(tokens, 2);
    if (!type || !isWord(tokens[type.next], "add") || !isWord(tokens[type.next + 1], "value")) {
      return {
        reason: "it changes an enum that older versions rely on",
        instead: "add a new enum value instead",
      };
    }
    let at = skipIfNotExists(tokens, type.next + 2);
    if (tokens[at]?.kind !== "string") return UNRECOGNIZED;
    at++;
    if (isWord(tokens[at], "before", "after") && tokens[at + 1]?.kind === "string") at += 2;
    return at === tokens.length ? undefined : UNRECOGNIZED;
  }
  if (isWord(first, "alter") && isWord(second, "table")) {
    let at = 2;
    if (isWord(tokens[at], "if") && isWord(tokens[at + 1], "exists")) at += 2;
    if (isWord(tokens[at], "only")) at++;
    const table = readName(tokens, at);
    if (!table) return UNRECOGNIZED;
    const actions = splitAt(tokens.slice(table.next), ",");
    if (actions.length === 0) return UNRECOGNIZED;
    for (const action of actions) {
      const refusal = refuseAlterTableAction(table.name, action, created);
      if (refusal) return refusal;
    }
    return undefined;
  }
  return UNRECOGNIZED;
};

const snippet = (sql: string, tokens: readonly Token[]) => {
  const text = sql.slice(tokens[0]?.start, tokens.at(-1)?.end).replace(/\s+/g, " ");
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

// Checks one migration's SQL. Every statement must be on the allow list; anything
// else, including what this parser cannot read, is refused.
export const checkSql = (file: string, sql: string): readonly string[] => {
  let tokens: readonly Token[];
  try {
    tokens = tokenize(sql);
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    return [
      `${file}: could not read the file, it has ${error.message}.\n  Instead: regenerate the migration with \`make db/generate\`.`,
    ];
  }
  const created: Created = { tables: new Set(), columns: new Set() };
  return splitAt(tokens, ";").flatMap((statement, index) => {
    const refusal = refuseStatement(statement, created);
    return refusal
      ? [
          `${file}, statement ${index + 1}: ${snippet(sql, statement)}\n` +
            `  Refused: ${refusal.reason}.\n  Instead: ${refusal.instead}.`,
        ]
      : [];
  });
};

type Entry = { readonly idx: number; readonly when: number; readonly tag: string };

const parseJournal = (text: string, where: string): readonly Entry[] => {
  try {
    return (JSON.parse(text) as { readonly entries: readonly Entry[] }).entries;
  } catch {
    throw new Error(
      `${where} is not a valid Drizzle journal. Restore it from git, then run \`make db/generate\`.`
    );
  }
};

const git = (root: string, args: readonly string[]) => {
  try {
    return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "git is not installed. Install git, or run without BASE to check every migration after 0000.",
        {
          cause: error,
        }
      );
    }
    return undefined;
  }
};

// Checks the migrations added since `base` (working tree included), or every
// migration after 0000 when there is no base. Returns one message per problem;
// throws when the check cannot run.
export const checkMigrations = (root: string, base?: string): readonly string[] => {
  const journalPath = join(root, JOURNAL);
  if (!existsSync(journalPath)) {
    throw new Error(
      `${JOURNAL} not found. Run this from the project root, or run \`make db/generate\` first.`
    );
  }
  const entries = parseJournal(readFileSync(journalPath, "utf8"), JOURNAL);
  const read = (entry: Entry) => {
    const file = `${DRIZZLE}/${entry.tag}.sql`;
    return existsSync(join(root, file))
      ? checkSql(file, readFileSync(join(root, file), "utf8"))
      : [
          `${file} is listed in ${JOURNAL} but missing.\n  Instead: run \`make db/generate\` again.`,
        ];
  };
  if (base === undefined) return entries.slice(1).flatMap(read);

  if (!git(root, ["rev-parse", "--git-dir"])) {
    throw new Error(
      `BASE=${base} was given, but ${root} is not a git repository. Run the check from a git clone, or leave BASE unset to check every migration after 0000.`
    );
  }
  if (!git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`])) {
    throw new Error(
      `BASE=${base} is not a commit in this clone. If the clone is shallow, fetch it first (\`git fetch --unshallow\`, or \`fetch-depth: 0\` in actions/checkout); otherwise pass a commit, branch, or tag that exists here.`
    );
  }
  const atBase = (path: string) => git(root, ["show", `${base}:./${path}`]);
  const baseJournal = atBase(JOURNAL);
  const baseEntries = baseJournal
    ? parseJournal(baseJournal.toString("utf8"), `${JOURNAL} at ${base}`)
    : [];

  const history = (
    git(root, ["ls-tree", "-r", "--name-only", base, "--", DRIZZLE])?.toString("utf8") ?? ""
  )
    .split("\n")
    .filter((path) => path !== "" && path !== JOURNAL)
    .flatMap((path) => {
      const now = join(root, path);
      if (!existsSync(now))
        return [`${path} was deleted, but it existed at BASE.\n  Instead: restore it from git.`];
      return atBase(path)?.equals(readFileSync(now))
        ? []
        : [
            `${path} was changed, but it existed at BASE and may already be applied.\n` +
              `  Instead: restore it from git and put the change in a new migration (\`make db/generate\`).`,
          ];
    });

  const reordered = baseEntries.some(
    (entry, at) =>
      entries[at]?.tag !== entry.tag ||
      entries[at]?.when !== entry.when ||
      entries[at]?.idx !== entry.idx
  );
  if (reordered) {
    return [
      ...history,
      `${JOURNAL} no longer starts with the migrations it had at BASE, in the same order.\n` +
        `  Instead: restore the journal from git and add new migrations after it with \`make db/generate\`.`,
    ];
  }
  const latest = Math.max(0, ...baseEntries.map((entry) => entry.when));
  const added = entries.slice(baseEntries.length);
  const undated = added
    .filter((entry) => entry.when <= latest)
    .map(
      (entry) =>
        `${entry.tag} in ${JOURNAL} is dated before the migrations at BASE, so Drizzle would never apply it to a database that has them.\n` +
        `  Instead: delete it and generate it again with \`make db/generate\`.`
    );
  return [...history, ...undated, ...added.flatMap(read)];
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === "-h" || arg === "--help") || args.length > 1) {
    console.log(USAGE);
    process.exit(args.length > 1 ? 2 : 0);
  }
  try {
    const found = checkMigrations(dirname(import.meta.dirname), args[0] || undefined);
    if (found.length > 0) {
      console.error(
        `${found.join("\n\n")}\n\nMigrations may only add to the database; see “Database changes” in AGENTS.md.`
      );
      process.exit(1);
    }
    console.log(
      args[0]
        ? `Migrations since ${args[0]} only add to the database.`
        : "Migrations after 0000 only add to the database."
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
