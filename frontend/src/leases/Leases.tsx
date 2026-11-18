import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useHashPath } from "../App.tsx";
import { focusOnMount, formatDate, localDay } from "../assets/format.ts";
import { useTRPC } from "../trpc.ts";
import { formatRent, states, type ListedLease } from "./format.ts";
import { LeaseDetail } from "./LeaseDetail.tsx";
import { NewLease } from "./LeaseForm.tsx";
import "./leases.css";

const views = [
  { path: "", title: "All leases" },
  { path: "vacant", title: "Vacant" },
  { path: "new", title: "Add a lease" },
] as const;

function LeaseTable({
  caption,
  leases,
}: {
  readonly caption: string;
  readonly leases: readonly ListedLease[];
}) {
  return (
    <div className="leases-scroll">
      <table className="leases-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Unit</th>
            <th scope="col">Tenant</th>
            <th scope="col">First day</th>
            <th scope="col">Last day</th>
            <th scope="col">Rent</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((lease) => (
            <tr key={lease.id}>
              <td>
                <a href={`#/leases/${lease.id}`}>{lease.unitName}</a>
              </td>
              <td>{lease.tenantName}</td>
              <td className="leases-date">{formatDate(lease.firstDay)}</td>
              <td className="leases-date">
                {lease.lastDay ? formatDate(lease.lastDay) : "Rolling"}
              </td>
              <td>{formatRent(lease.rent, lease.rentPeriod)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Every lease, grouped by its state on the viewer's day, filtered by unit and by tenant.
function LeaseList() {
  const trpc = useTRPC();
  const today = localDay();
  const [recordId, setRecordId] = useState<number>();
  const [customerId, setCustomerId] = useState<number>();
  const units = useQuery(trpc.leases.units.queryOptions({ today }));
  const tenants = useQuery(trpc.customers.list.queryOptions());
  const leases = useQuery(trpc.leases.list.queryOptions({ today, recordId, customerId }));
  const filtered = recordId !== undefined || customerId !== undefined;
  const optional = (value: string) => (value ? Number(value) : undefined);

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Leases
      </h1>
      <div className="leases-fields" role="group" aria-label="Filter leases">
        <label>
          Unit{" "}
          <select
            value={recordId ?? ""}
            onChange={(event) => setRecordId(optional(event.target.value))}
          >
            <option value="">All units</option>
            {units.data?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tenant{" "}
          <select
            value={customerId ?? ""}
            onChange={(event) => setCustomerId(optional(event.target.value))}
          >
            <option value="">All tenants</option>
            {tenants.data?.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setRecordId(undefined);
              setCustomerId(undefined);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {leases.error && <p role="alert">Unable to load leases: {leases.error.message}</p>}
      {leases.data?.length === 0 &&
        (filtered ? (
          <p>No leases for this unit and tenant. Clear the filters to see every lease.</p>
        ) : (
          <p>
            No leases yet. <a href="#/leases/new">Add a lease</a> to let a unit to a tenant.
          </p>
        ))}
      {leases.data &&
        states.map(({ state, label }) => {
          const inState = leases.data.filter((lease) => lease.state === state);
          return inState.length > 0 && <LeaseTable key={state} caption={label} leases={inState} />;
        })}
    </main>
  );
}

// Units that are not archived and have no lease running today.
function Vacant() {
  const trpc = useTRPC();
  const units = useQuery(trpc.leases.units.queryOptions({ today: localDay() }));
  const vacant = units.data?.filter((unit) => unit.vacant);

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Vacant units
      </h1>
      <p className="leases-hint">Units with no lease running today. Archived units are left out.</p>
      {units.error && <p role="alert">Unable to load units: {units.error.message}</p>}
      {vacant?.length === 0 && <p>Every unit is let today.</p>}
      <ul className="leases-units">
        {vacant?.map((unit) => (
          <li key={unit.id}>
            <a href={`#/assets/${unit.id}`}>{unit.name}</a>
            {unit.tag && ` (${unit.tag})`} <a href={`#/leases/new/${unit.id}`}>Let {unit.name}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

// #/leases (the list), #/leases/vacant, #/leases/new and #/leases/<id>.
export function Leases() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "vacant" ? (
      <Vacant />
    ) : first === "new" ? (
      <NewLease />
    ) : first && Number.isInteger(id) ? (
      <LeaseDetail key={id} id={id} />
    ) : (
      <LeaseList />
    );

  return (
    <>
      <nav aria-label="Lease views" className="leases-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/leases/${path}` : "#/leases"}
                aria-current={path === first ? "page" : undefined}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {view}
    </>
  );
}
