import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDay } from "./format.ts";

// Sunday first, matching the weekday numbers the server stores (0 is Sunday).
const weekdays = Array.from({ length: 7 }, (_, day) =>
  new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2030, 0, 6 + day))
  )
);

// "09:00:00" from the database shows as "09:00".
const clock = (time: string | null) => time?.slice(0, 5) ?? "";

// Weekly hours and date exceptions for one resource, on its own clock.
export function Hours() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const resources = useQuery(trpc.bookings.resources.queryOptions());
  const [picked, setPicked] = useState<number>();
  const resource =
    resources.data?.find((candidate) => candidate.id === picked) ?? resources.data?.[0];
  const availability = useQuery({
    ...trpc.bookings.availability.queryOptions({ resourceId: resource?.id ?? -1 }),
    enabled: resource !== undefined,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.bookings.availability.pathKey() });
  const addRule = useMutation(trpc.bookings.addRule.mutationOptions({ onSuccess: refresh }));
  const deleteRule = useMutation(trpc.bookings.deleteRule.mutationOptions({ onSuccess: refresh }));
  const addException = useMutation(
    trpc.bookings.addException.mutationOptions({ onSuccess: refresh })
  );
  const deleteException = useMutation(
    trpc.bookings.deleteException.mutationOptions({ onSuccess: refresh })
  );
  const error = addRule.error ?? deleteRule.error ?? addException.error ?? deleteException.error;

  const onAddRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resource) return;
    const data = new FormData(event.currentTarget);
    addRule.mutate({
      resourceId: resource.id,
      weekday: Number(data.get("weekday")),
      startTime: String(data.get("startTime")),
      endTime: String(data.get("endTime")),
    });
  };

  const onAddException = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resource) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const time = (name: string) => String(data.get(name)) || null;
    addException.mutate(
      {
        resourceId: resource.id,
        date: String(data.get("date")),
        startTime: time("startTime"),
        endTime: time("endTime"),
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Hours
      </h1>
      {resources.error && <p role="alert">Unable to load resources: {resources.error.message}</p>}
      {resources.data?.length === 0 && (
        <p>
          Hours belong to a resource. <a href="#/bookings/settings">Add a resource</a> first.
        </p>
      )}
      {resource && (
        <>
          <p>
            <label>
              Resource{" "}
              <select
                value={resource.id}
                onChange={(event) => setPicked(Number(event.target.value))}
              >
                {resources.data?.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>{" "}
            Times are in {resource.timeZone}.
          </p>
          {error && <p role="alert">Unable to save the hours: {error.message}</p>}

          <section aria-labelledby="weekly">
            <h2 id="weekly">Every week</h2>
            {availability.data?.rules.length === 0 ? (
              <p>No weekly hours yet, so nothing can be booked. Add the first below.</p>
            ) : (
              <ul className="booking-rows">
                {availability.data?.rules.map((rule) => (
                  <li key={rule.id} className="booking-actions">
                    {weekdays[rule.weekday]} {clock(rule.startTime)}–{clock(rule.endTime)}
                    <button
                      type="button"
                      aria-label={`Remove ${weekdays[rule.weekday]} ${clock(rule.startTime)} to ${clock(rule.endTime)}`}
                      onClick={() => deleteRule.mutate({ id: rule.id })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={onAddRule} aria-labelledby="new-rule" className="booking-actions">
              <h3 id="new-rule">Add weekly hours</h3>
              <label>
                Day{" "}
                <select name="weekday" defaultValue={1}>
                  {weekdays.map((name, day) => (
                    <option key={name} value={day}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From <input name="startTime" type="time" required defaultValue="09:00" />
              </label>
              <label>
                Until <input name="endTime" type="time" required defaultValue="17:00" />
              </label>
              <button type="submit" disabled={addRule.isPending}>
                Add hours
              </button>
            </form>
          </section>

          <section aria-labelledby="exceptions">
            <h2 id="exceptions">Exceptions</h2>
            <p>An exception replaces the weekly hours on its date.</p>
            {availability.data?.exceptions.length === 0 ? (
              <p>No exceptions.</p>
            ) : (
              <ul className="booking-rows">
                {availability.data?.exceptions.map((exception) => {
                  const what = exception.startTime
                    ? `${clock(exception.startTime)}–${clock(exception.endTime)}`
                    : "Closed";
                  return (
                    <li key={exception.id} className="booking-actions">
                      {formatDay(exception.date)}: {what}
                      <button
                        type="button"
                        aria-label={`Remove ${formatDay(exception.date)}: ${what}`}
                        onClick={() => deleteException.mutate({ id: exception.id })}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <form
              onSubmit={onAddException}
              aria-labelledby="new-exception"
              className="booking-actions"
            >
              <h3 id="new-exception">Add an exception</h3>
              <label>
                Date <input name="date" type="date" required />
              </label>
              <label>
                From <input name="startTime" type="time" aria-describedby="exception-help" />
              </label>
              <label>
                Until <input name="endTime" type="time" aria-describedby="exception-help" />
              </label>
              <button type="submit" disabled={addException.isPending}>
                Add exception
              </button>
              <p id="exception-help" className="booking-muted">
                Leave both times empty to close for the day.
              </p>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
