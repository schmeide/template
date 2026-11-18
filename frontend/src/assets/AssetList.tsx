import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { downloadCsv } from "../csv/download.ts";
import { useTRPC } from "../trpc.ts";
import {
  focusOnMount,
  formatDate,
  localDay,
  statuses,
  statusLabel,
  type Filter,
} from "./format.ts";

const pageSize = 50;

const sortOptions = [
  { value: "name", label: "Name, A to Z" },
  { value: "name desc", label: "Name, Z to A" },
  { value: "expiresOn", label: "Expires, soonest first" },
  { value: "expiresOn desc", label: "Expires, latest first" },
  { value: "createdAt desc", label: "Newest first" },
  { value: "createdAt", label: "Oldest first" },
] as const;

const windows = [30, 60, 90] as const;

const count = new Intl.NumberFormat();

// Every asset (or, with `expiring`, those past or near their date), filtered, sorted and paged on
// the server, with a CSV download of the whole filter.
export function AssetList({ expiring = false }: { readonly expiring?: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const categories = useQuery(trpc.assets.categories.queryOptions());
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number>();
  const [status, setStatus] = useState<Filter["status"]>();
  const [sort, setSort] = useState<string>(expiring ? "expiresOn" : "name");
  const [days, setDays] = useState<number>(30);
  const [page, setPage] = useState(1);
  const [sortKey, direction] = sort.split(" ");
  const filter: Filter = {
    search: search || undefined,
    categoryId,
    status,
    expiring: expiring ? { today: localDay(), days } : undefined,
    sort: sortKey as Filter["sort"],
    descending: direction === "desc",
  };
  const list = useQuery({
    ...trpc.assets.list.queryOptions({ ...filter, page }),
    placeholderData: keepPreviousData,
  });
  const exportCsv = useMutation({
    mutationFn: () => queryClient.fetchQuery(trpc.assets.exportCsv.queryOptions(filter)),
    onSuccess: (csv) => downloadCsv(csv, expiring ? "expiring-assets.csv" : "assets.csv"),
  });
  const filtered = search !== "" || categoryId !== undefined || status !== undefined;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const today = localDay();

  // Any change to what is shown starts again at the first page.
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    change(setSearch)(String(new FormData(event.currentTarget).get("search")).trim());
  };

  const clear = () => {
    change(setSearch)("");
    setCategoryId(undefined);
    setStatus(undefined);
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {expiring ? "Expiring assets" : "Assets"}
      </h1>
      {expiring && (
        <p className="assets-hint">Assets past their date, or reaching it within the window.</p>
      )}
      <form role="search" onSubmit={onSearch} className="assets-fields">
        <label>
          Search{" "}
          <input
            key={search === "" ? "empty" : "searched"}
            name="search"
            type="search"
            defaultValue={search}
            maxLength={200}
            aria-describedby="assets-search-hint"
          />
        </label>
        <button type="submit">Search</button>
        <span id="assets-search-hint" className="assets-hint">
          Matches name, tag, owner and notes.
        </span>
      </form>
      <div className="assets-fields">
        <label>
          Category{" "}
          <select
            value={categoryId ?? ""}
            onChange={(event) =>
              change(setCategoryId)(event.target.value ? Number(event.target.value) : undefined)
            }
          >
            <option value="">All categories</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {expiring ? (
          <label>
            Within{" "}
            <select value={days} onChange={(event) => change(setDays)(Number(event.target.value))}>
              {windows.map((window) => (
                <option key={window} value={window}>
                  {window} days
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Status{" "}
              <select
                value={status ?? ""}
                onChange={(event) =>
                  change(setStatus)((event.target.value || undefined) as Filter["status"])
                }
              >
                <option value="">All but archived</option>
                {statuses.map((option) => (
                  <option key={option.status} value={option.status}>
                    {option.label}
                  </option>
                ))}
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Sort by{" "}
              <select value={sort} onChange={(event) => change(setSort)(event.target.value)}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          disabled={exportCsv.isPending || total === 0}
          onClick={() => exportCsv.mutate()}
        >
          Download CSV
        </button>
      </div>
      {exportCsv.error && <p role="alert">Unable to export: {exportCsv.error.message}</p>}
      {list.error && <p role="alert">Unable to load assets: {list.error.message}</p>}
      {list.data && total === 0 && (
        <Empty filtered={filtered} expiring={expiring} search={search} onClear={clear} />
      )}
      {list.data && total > 0 && (
        <>
          <div className="assets-scroll">
            <table className="assets-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Tag</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <a href={`#/assets/${row.id}`}>{row.name}</a>
                    </td>
                    <td>{row.tag}</td>
                    <td>{row.category}</td>
                    <td>{row.archivedAt ? "Archived" : statusLabel(row.status)}</td>
                    <td>{row.owner}</td>
                    <td className="assets-date">
                      {row.expiresOn && formatDate(row.expiresOn)}
                      {row.expiresOn && row.expiresOn < today && (
                        <>
                          {" "}
                          <strong className="assets-expired">Expired</strong>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="assets-paging">
        <p role="status">
          {total > 0
            ? `Showing ${count.format((page - 1) * pageSize + 1)}–${count.format(
                Math.min(page * pageSize, total)
              )} of ${count.format(total)}`
            : ""}
        </p>
        {pages > 1 && (
          <p className="assets-buttons">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous page
            </button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next page
            </button>
          </p>
        )}
      </div>
    </main>
  );
}

function Empty({
  filtered,
  expiring,
  search,
  onClear,
}: {
  readonly filtered: boolean;
  readonly expiring: boolean;
  readonly search: string;
  readonly onClear: () => void;
}) {
  if (filtered) {
    return (
      <p>
        {search
          ? `No assets match “${search}” with these filters.`
          : "No assets match these filters."}{" "}
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      </p>
    );
  }
  if (expiring) return <p>Nothing has expired or expires in this window.</p>;
  return (
    <p>
      No assets yet. <a href="#/assets/new">Add an asset</a> or{" "}
      <a href="#/assets/import">import a CSV file</a>.
    </p>
  );
}
