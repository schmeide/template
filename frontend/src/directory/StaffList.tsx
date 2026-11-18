import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDate, localDay } from "./format.ts";

const count = new Intl.NumberFormat();
const plural = new Intl.PluralRules();

// Everyone in "Acting as", with their details where they have them: current staff, or with
// `former`, those whose leaving date is before today.
export function StaffList() {
  const trpc = useTRPC();
  const teams = useQuery(trpc.directory.teams.queryOptions());
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [former, setFormer] = useState(false);
  const list = useQuery({
    ...trpc.directory.list.queryOptions({
      today: localDay(),
      search: search || undefined,
      team: team || undefined,
      former,
    }),
    placeholderData: keepPreviousData,
  });
  const filtered = search !== "" || team !== "";
  const total = list.data?.length ?? 0;

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(String(new FormData(event.currentTarget).get("search")).trim());
  };

  const clear = () => {
    setSearch("");
    setTeam("");
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        {former ? "Former staff" : "Staff"}
      </h1>
      <form role="search" onSubmit={onSearch} className="directory-fields">
        <label>
          Search{" "}
          <input
            key={search === "" ? "empty" : "searched"}
            name="search"
            type="search"
            defaultValue={search}
            maxLength={200}
            aria-describedby="directory-search-hint"
          />
        </label>
        <button type="submit">Search</button>
        <span id="directory-search-hint" className="directory-hint">
          Matches name, email, job title and team.
        </span>
      </form>
      <div className="directory-fields">
        <label>
          Team{" "}
          <select value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="">All teams</option>
            {teams.data?.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show{" "}
          <select
            value={former ? "former" : "current"}
            onChange={(event) => setFormer(event.target.value === "former")}
          >
            <option value="current">Current staff</option>
            <option value="former">Former staff</option>
          </select>
        </label>
      </div>
      {list.error && <p role="alert">Unable to load staff: {list.error.message}</p>}
      {list.data && total === 0 && (
        <Empty filtered={filtered} former={former} search={search} onClear={clear} />
      )}
      {list.data && total > 0 && (
        <div className="directory-scroll">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Job title</th>
                <th scope="col">Team</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                {former && <th scope="col">Left</th>}
              </tr>
            </thead>
            <tbody>
              {list.data.map(({ person, entry }) => (
                <tr key={person.id}>
                  <td>
                    <a href={`#/directory/${person.id}`}>{person.name}</a>
                  </td>
                  <td>{entry?.jobTitle}</td>
                  <td>{entry?.team}</td>
                  <td>{entry?.email && <a href={`mailto:${entry.email}`}>{entry.email}</a>}</td>
                  <td className="directory-number">
                    {entry?.phone && <a href={`tel:${entry.phone}`}>{entry.phone}</a>}
                  </td>
                  {former && (
                    <td className="directory-number">
                      {entry?.leavesOn && formatDate(entry.leavesOn)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p role="status">
        {total > 0
          ? `${count.format(total)} ${plural.select(total) === "one" ? "person" : "people"}`
          : ""}
      </p>
    </main>
  );
}

function Empty({
  filtered,
  former,
  search,
  onClear,
}: {
  readonly filtered: boolean;
  readonly former: boolean;
  readonly search: string;
  readonly onClear: () => void;
}) {
  if (filtered) {
    return (
      <p>
        {search
          ? `No staff match “${search}” with these filters.`
          : "No staff match these filters."}{" "}
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      </p>
    );
  }
  if (former) {
    return <p>No former staff. A person moves here the day after their leaving date.</p>;
  }
  return (
    <p>
      No staff yet. <a href="#/directory/new">Add a person</a>.
    </p>
  );
}
