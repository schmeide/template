import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useState, type FormEvent } from "react";
import type { AppRouter } from "../../../backend/src/router.ts";
import { Slots, useHashPath } from "../App.tsx";
import { currencyDigits, formatMoney, formatScaled, parseScaled } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import "./membership.css";

type Outputs = inferRouterOutputs<AppRouter>["membership"];
type Level = Outputs["levels"][number];
type Status = Outputs["members"][number]["status"];

// Fees are minor units of this currency. Edit for the project.
const currency = "USD";
const places = currencyDigits(currency);

const statusLabels: Readonly<Record<Status, string>> = {
  current: "Current",
  due: "Due for renewal",
  lapsed: "Lapsed",
};

const focusOnMount = (element: HTMLElement | null) => element?.focus();

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

const formatLength = (months: number | null) =>
  months === null ? "For life" : months === 12 ? "1 year" : `${months} months`;

// A level's fields as typed, or a message for the first one that is not valid.
const readLevel = (data: FormData) => {
  const fee = parseScaled(String(data.get("fee")), places);
  const monthsText = String(data.get("months")).trim();
  if (fee === undefined || fee < 0)
    return `Enter the fee as an amount, such as ${formatScaled(5000, places)}`;
  return {
    name: String(data.get("name")),
    fee,
    months: monthsText === "" ? null : Number(monthsText),
  };
};

function LevelFields({ level }: { readonly level?: Level }) {
  return (
    <>
      <label>
        Name <input name="name" required maxLength={100} defaultValue={level?.name} />
      </label>
      <label>
        Fee ({currency}){" "}
        <input
          name="fee"
          required
          inputMode="decimal"
          size={8}
          defaultValue={level ? formatScaled(level.fee, places) : undefined}
        />
      </label>
      <label>
        Months{" "}
        <input
          name="months"
          type="number"
          min={1}
          max={120}
          aria-describedby="months-help"
          defaultValue={level?.months ?? undefined}
        />
      </label>
    </>
  );
}

function LevelForm({ level }: { readonly level: Level }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.membership.pathKey() });
  const update = useMutation(trpc.membership.updateLevel.mutationOptions({ onSettled: refresh }));
  const retire = useMutation(trpc.membership.retireLevel.mutationOptions({ onSettled: refresh }));
  const [invalid, setInvalid] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = readLevel(new FormData(event.currentTarget));
    setInvalid(typeof fields === "string" ? fields : "");
    if (typeof fields !== "string") update.mutate({ id: level.id, ...fields });
  };

  const error = invalid || update.error?.message || retire.error?.message;
  return (
    <form onSubmit={onSubmit}>
      <fieldset className="membership-fields">
        <legend>{level.name}</legend>
        <LevelFields level={level} />
        <button type="submit" disabled={update.isPending}>
          Save level
        </button>
        <button
          type="button"
          disabled={retire.isPending}
          onClick={() => retire.mutate({ id: level.id })}
        >
          Retire level
        </button>
        {error && (
          <p role="alert">
            Unable to save {level.name}: {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}

function Levels({ levels }: { readonly levels: readonly Level[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(
    trpc.membership.createLevel.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.membership.pathKey() }),
    })
  );
  const [invalid, setInvalid] = useState("");
  const retired = levels.filter((level) => level.retired);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = readLevel(new FormData(form));
    setInvalid(typeof fields === "string" ? fields : "");
    if (typeof fields !== "string") create.mutate(fields, { onSuccess: () => form.reset() });
  };

  const error = invalid || create.error?.message;
  return (
    <section aria-labelledby="membership-levels">
      <h2 id="membership-levels">Levels</h2>
      <p id="months-help" className="membership-muted">
        Months is how long a period lasts: 12 for a year. Leave it empty for life membership. A
        changed fee applies to new periods only. A retired level is no longer offered, and members
        keep the periods they have at it.
      </p>
      {levels
        .filter((level) => !level.retired)
        .map((level) => (
          <LevelForm key={`${level.id}-${level.fee}-${level.name}`} level={level} />
        ))}
      <form onSubmit={onSubmit}>
        <fieldset className="membership-fields">
          <legend>Add a level</legend>
          <LevelFields />
          <button type="submit" disabled={create.isPending}>
            Add level
          </button>
          {error && <p role="alert">Unable to add the level: {error}</p>}
        </fieldset>
      </form>
      {retired.length > 0 && (
        <p className="membership-muted">Retired: {retired.map((level) => level.name).join(", ")}</p>
      )}
    </section>
  );
}

// Picks a level that is not retired, starting from `defaultId` when it still is one.
function LevelSelect({
  levels,
  defaultId,
}: {
  readonly levels: readonly Level[];
  readonly defaultId?: number;
}) {
  const open = levels.filter((level) => !level.retired);
  return (
    <label>
      Level{" "}
      <select
        name="levelId"
        required
        defaultValue={open.some((level) => level.id === defaultId) ? defaultId : ""}
      >
        <option value="" disabled>
          Choose a level
        </option>
        {open.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}, {formatMoney(level.fee, currency)},{" "}
            {formatLength(level.months).toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function MemberList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const members = useQuery(trpc.membership.members.queryOptions());
  const levels = useQuery(trpc.membership.levels.queryOptions());
  const customers = useQuery(trpc.customers.list.queryOptions());
  const join = useMutation(
    trpc.membership.addPeriod.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.membership.pathKey() }),
    })
  );
  const [status, setStatus] = useState<Status | "">("");

  const shown = (members.data ?? []).filter((member) => status === "" || member.status === status);
  const memberIds = new Set((members.data ?? []).map((member) => member.customerId));
  const others = (customers.data ?? []).filter((customer) => !memberIds.has(customer.id));

  const onJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    join.mutate(
      {
        customerId: Number(data.get("customerId")),
        levelId: Number(data.get("levelId")),
        latestPeriodId: null,
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Members
      </h1>
      <label>
        Status{" "}
        <select value={status} onChange={(event) => setStatus(event.target.value as Status | "")}>
          <option value="">All</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {members.error && <p role="alert">Unable to load members: {members.error.message}</p>}
      {members.data?.length === 0 && (
        <p>No members yet. Add a level, then add the first member below.</p>
      )}
      {members.data && members.data.length > 0 && shown.length === 0 && (
        <p>
          No members are {statusLabels[status || "current"].toLowerCase()}.{" "}
          <button type="button" onClick={() => setStatus("")}>
            Show all members
          </button>
        </p>
      )}
      {shown.length > 0 && (
        <div className="membership-scroll">
          <table className="membership-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Level</th>
                <th scope="col">Status</th>
                <th scope="col">Ends</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((member) => (
                <tr key={member.customerId}>
                  <td>
                    <a href={`#/members/${member.customerId}`}>{member.name}</a>
                  </td>
                  <td>{member.levelName}</td>
                  <td>{statusLabels[member.status]}</td>
                  <td>{member.endsOn === null ? "Never" : formatDate(member.endsOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={onJoin} aria-labelledby="membership-join" className="membership-form">
        <h2 id="membership-join">Add a member</h2>
        {customers.data && others.length === 0 && (
          <p>
            Every customer is a member. <a href="#/customers">Add a customer</a> to add someone new.
          </p>
        )}
        <label>
          Customer{" "}
          <select name="customerId" required defaultValue="">
            <option value="" disabled>
              Choose a customer
            </option>
            {others.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.email ? `${customer.name}, ${customer.email}` : customer.name}
              </option>
            ))}
          </select>
        </label>
        <LevelSelect levels={levels.data ?? []} />
        <p className="membership-muted">The first period starts today.</p>
        <button type="submit" disabled={join.isPending}>
          Join
        </button>
        {join.error && <p role="alert">Unable to add the member: {join.error.message}</p>}
      </form>
      <p role="status">{join.isSuccess ? "Member added" : ""}</p>
      {levels.data && <Levels levels={levels.data} />}
    </main>
  );
}

function MemberDetail({ customerId }: { readonly customerId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const member = useQuery(trpc.membership.member.queryOptions({ customerId }));
  const levels = useQuery(trpc.membership.levels.queryOptions());
  const renew = useMutation(
    trpc.membership.addPeriod.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.membership.pathKey() }),
    })
  );

  const data = member.data;
  const latest = data?.periods[0];

  const onRenew = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const levelId = Number(new FormData(event.currentTarget).get("levelId"));
    if (latest) renew.mutate({ customerId, levelId, latestPeriodId: latest.id });
  };

  return (
    <main>
      <p>
        <a href="#/members">Back to members</a>
      </p>
      {member.error && <p role="alert">Unable to load this member: {member.error.message}</p>}
      {data && latest && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {data.customer.name}
          </h1>
          <p>
            {statusLabels[data.status]}, {latest.levelName}
            {latest.endsOn === null
              ? ", for life"
              : `, ${data.status === "lapsed" ? "ended" : "until"} ${formatDate(latest.endsOn)}`}
            . <a href={`#/customers/${customerId}`}>Contact details</a>
          </p>
          <h2 id="membership-periods">Periods</h2>
          <ol aria-labelledby="membership-periods" className="membership-periods">
            {data.periods.map((period) => (
              <li key={period.id}>
                {period.levelName}, {formatDate(period.startsOn)}
                {period.endsOn === null ? " for life" : ` to ${formatDate(period.endsOn)}`},{" "}
                {formatMoney(period.fee, currency)}
                <Slots name="period" id={period.id} />
              </li>
            ))}
          </ol>
          {latest.endsOn !== null && levels.data && (
            <form
              key={latest.id}
              onSubmit={onRenew}
              aria-labelledby="membership-renew"
              className="membership-form"
            >
              <h2 id="membership-renew">Renew</h2>
              <LevelSelect levels={levels.data} defaultId={latest.levelId} />
              <p className="membership-muted">
                {data.status === "lapsed"
                  ? "The new period starts today."
                  : "The new period starts the day after this one ends."}
              </p>
              <button type="submit" disabled={renew.isPending}>
                Renew
              </button>
              {renew.error && <p role="alert">Unable to renew: {renew.error.message}</p>}
            </form>
          )}
          <p role="status">{renew.isSuccess ? "Renewed" : ""}</p>
        </>
      )}
    </main>
  );
}

export function Members() {
  const [, id] = useHashPath();
  return id ? <MemberDetail key={id} customerId={Number(id)} /> : <MemberList />;
}
