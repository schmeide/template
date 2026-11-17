import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "../trpc.ts";
import {
  addDays,
  browserZone,
  focusOnMount,
  formatDay,
  formatTime,
  localDate,
  statusLabel,
  weekStart,
} from "./format.ts";

type Mode = "day" | "week";

// Bookings by day or by week, each on the day and clock of its resource's zone.
// ponytail: an agenda list, not a time grid; draw a grid when a project needs to see gaps at a glance.
export function Calendar() {
  const trpc = useTRPC();
  const resources = useQuery(trpc.bookings.resources.queryOptions());
  const zone = resources.data?.[0]?.timeZone ?? browserZone();
  const today = localDate(new Date(), zone);
  const [mode, setMode] = useState<Mode>("day");
  const [picked, setPicked] = useState<string>();
  const date = picked ?? today;
  const from = mode === "day" ? date : weekStart(date);
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, index) => addDays(from, index));
  const to = days[days.length - 1];
  const bookings = useQuery(trpc.bookings.list.queryOptions({ from, to }));
  const shift = mode === "day" ? 1 : 7;

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Bookings
      </h1>
      {resources.data?.length === 0 && (
        <p>
          Nothing can be booked yet. <a href="#/bookings/settings">Add a resource and a service</a>,
          then set its <a href="#/bookings/hours">hours</a>.
        </p>
      )}
      <div className="booking-actions">
        <fieldset className="booking-mode">
          <legend>Show</legend>
          {(["day", "week"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />{" "}
              {value === "day" ? "Day" : "Week"}
            </label>
          ))}
        </fieldset>
        <label>
          Date{" "}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => setPicked(event.target.value || undefined)}
          />
        </label>
        <button type="button" onClick={() => setPicked(addDays(date, -shift))}>
          Previous {mode}
        </button>
        <button type="button" onClick={() => setPicked(undefined)}>
          Today
        </button>
        <button type="button" onClick={() => setPicked(addDays(date, shift))}>
          Next {mode}
        </button>
      </div>
      {bookings.error && <p role="alert">Unable to load bookings: {bookings.error.message}</p>}
      <div className={mode === "week" ? "booking-week" : undefined}>
        {days.map((day) => {
          const own = bookings.data?.filter((booking) => booking.date === day) ?? [];
          return (
            <section key={day} aria-labelledby={`day-${day}`} className="booking-day">
              <h2 id={`day-${day}`}>{formatDay(day)}</h2>
              {bookings.isPending ? (
                <p>Loading…</p>
              ) : own.length === 0 ? (
                <p className="booking-muted">No bookings.</p>
              ) : (
                <ol className="booking-list">
                  {own.map((booking) => (
                    <li
                      key={booking.id}
                      className={booking.status === "cancelled" ? "booking-cancelled" : undefined}
                    >
                      <a href={`#/bookings/${booking.id}`}>
                        {formatTime(booking.startsAt, booking.timeZone)}–
                        {formatTime(booking.endsAt, booking.timeZone)}: {booking.serviceName} for{" "}
                        {booking.customerName}
                      </a>
                      <p className="booking-muted">
                        {booking.resourceName}, {statusLabel(booking.status)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
