import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, type ImportCheck } from "./format.ts";

// The server's limit (importLimits in the registry schema); checked here too so a large file is
// refused before it is sent.
const maxCharacters = 300_000;

const plural = new Intl.PluralRules();
const assets = (count: number) => `${count} ${plural.select(count) === "one" ? "asset" : "assets"}`;

// Pick a CSV file, see what would be imported and every row with a problem, then import it. The
// server checks the file again on import; a file with any problem imports nothing.
export function Import() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<{ readonly name: string; readonly csv: string }>();
  const [tooLarge, setTooLarge] = useState(false);
  const preview = useMutation(trpc.assets.previewImport.mutationOptions());
  const commit = useMutation(
    trpc.assets.import.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() }),
    })
  );
  // The import checks the file again; its result replaces the preview's.
  const check: ImportCheck | undefined = commit.data ?? preview.data;
  const imported = commit.data?.imported ?? 0;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const chosen = input.files?.[0];
    // Cleared so choosing the same file again, once fixed, still counts as a change.
    input.value = "";
    preview.reset();
    commit.reset();
    setFile(undefined);
    if (!chosen) return;
    const csv = await chosen.text();
    setTooLarge(csv.length > maxCharacters);
    if (csv.length > maxCharacters) return;
    setFile({ name: chosen.name, csv });
    preview.mutate({ csv });
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Import assets
      </h1>
      <p>
        The first row names the columns: Name (required), Tag, Category, Status, Owner, Expires and
        Notes, in any order. A file downloaded from the asset list has them all.
      </p>
      <ul className="assets-hint">
        <li>Categories must already exist. Add them under Categories first.</li>
        <li>Status is one of in use, in storage, in repair or lost. Empty means in use.</li>
        <li>Write dates as YYYY-MM-DD.</li>
        <li>Up to 5,000 rows and about 300 KB per file. Split a bigger file.</li>
        <li>If any row has a problem, nothing is imported. Fix the file and choose it again.</li>
      </ul>
      <p>
        <label>
          CSV file <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
      </p>
      {tooLarge && (
        <p role="alert">
          This file is too large. Split it into files of about 300 KB and import each.
        </p>
      )}
      {preview.error && <p role="alert">Unable to check the file: {preview.error.message}</p>}
      {commit.error && <p role="alert">Unable to import: {commit.error.message}</p>}
      <p role="status">
        {preview.isPending
          ? "Checking the file…"
          : file && check
            ? `${file.name}: ${imported > 0 ? `imported ${assets(imported)}.` : summary(check)}`
            : ""}
      </p>
      {imported > 0 && (
        <p>
          <a href="#/assets">See all assets</a>
        </p>
      )}
      {file && check && imported === 0 && (
        <>
          {check.problems.length === 0 && check.ready > 0 && (
            <p>
              <button
                type="button"
                disabled={commit.isPending}
                onClick={() => commit.mutate({ csv: file.csv })}
              >
                Import {assets(check.ready)}
              </button>
            </p>
          )}
          <Preview check={check} />
        </>
      )}
    </main>
  );
}

const summary = (check: ImportCheck) => {
  const rows = check.problems.length;
  if (rows > 0) {
    const problems =
      plural.select(rows) === "one" ? "1 row has a problem" : `${rows} rows have problems`;
    return `${problems}, so nothing can be imported. Fix the file and choose it again.`;
  }
  return check.ready === 0 ? "no rows to import." : `${assets(check.ready)} ready to import.`;
};

function Preview({ check }: { readonly check: ImportCheck }) {
  return (
    <>
      {check.ignored.length > 0 && (
        <p>These columns are not imported: {check.ignored.join(", ")}.</p>
      )}
      {check.problems.length > 0 && (
        <div className="assets-scroll">
          <table className="assets-table">
            <caption>Rows with problems</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Problem</th>
              </tr>
            </thead>
            <tbody>
              {check.problems.map((problem) => (
                <tr key={problem.row}>
                  <th scope="row">{problem.row}</th>
                  <td>
                    {problem.messages.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
