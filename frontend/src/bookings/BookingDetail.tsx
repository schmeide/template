import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDay, formatTime, localDate, statuses } from "./format.ts";
import { readSlot, SlotPicker } from "./SlotPicker.tsx";

export function BookingDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const booking = useQuery(trpc.bookings.get.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  const setStatus = useMutation(trpc.bookings.setStatus.mutationOptions({ onSettled: refresh }));
  const move = useMutation(trpc.bookings.move.mutationOptions({ onSettled: refresh }));

  const onStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("status"));
    const status = statuses.find((candidate) => candidate.value === value)?.value;
    if (status) setStatus.mutate({ id, status });
  };

  const onMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slot = readSlot(new FormData(event.currentTarget));
    if (slot) move.mutate({ id, ...slot });
  };

  const data = booking.data;
  const open = data?.status === "booked" || data?.status === "confirmed";

  return (
    <main>
      <p>
        <a href="#/bookings">Back to the calendar</a>
      </p>
      {booking.error && <p role="alert">Unable to load this booking: {booking.error.message}</p>}
      {data && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {data.service.name} for {data.customer.name}
          </h1>
          <dl className="booking-facts">
            <div>
              <dt>When</dt>
              <dd>
                {formatDay(localDate(data.startsAt, data.resource.timeZone))},{" "}
                {formatTime(data.startsAt, data.resource.timeZone)}–
                {formatTime(data.endsAt, data.resource.timeZone)}
              </dd>
            </div>
            <div>
              <dt>With</dt>
              <dd>{data.resource.name}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>
                <a href={`#/customers/${data.customer.id}`}>{data.customer.name}</a>
                {data.customer.email && <>, {data.customer.email}</>}
                {data.customer.phone && <>, {data.customer.phone}</>}
              </dd>
            </div>
          </dl>
          {data.status === "cancelled" ? (
            <p>This booking is cancelled and its time is free for others.</p>
          ) : (
            <form key={data.status} onSubmit={onStatus} className="booking-actions">
              <h2>Status</h2>
              <label>
                Status{" "}
                <select name="status" defaultValue={data.status} aria-describedby="status-help">
                  {statuses.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={setStatus.isPending}>
                Save status
              </button>
              <p id="status-help" className="booking-muted">
                Cancelling frees the time for others and cannot be undone.
              </p>
              {setStatus.error && (
                <p role="alert">Unable to save the status: {setStatus.error.message}</p>
              )}
            </form>
          )}
          {open && (
            <form
              key={data.startsAt.toISOString()}
              onSubmit={onMove}
              aria-labelledby="booking-move"
              className="booking-form"
            >
              <h2 id="booking-move">Move to another time</h2>
              <SlotPicker
                serviceId={data.serviceId}
                defaultDate={localDate(data.startsAt, data.resource.timeZone)}
                isClass={data.service.capacity > 1}
              />
              <p>
                <button type="submit" disabled={move.isPending}>
                  Move booking
                </button>
              </p>
              {move.error && <p role="alert">Unable to move: {move.error.message}</p>}
            </form>
          )}
          <p role="status">
            {setStatus.isSuccess ? "Status saved" : move.isSuccess ? "Booking moved" : ""}
          </p>
        </>
      )}
    </main>
  );
}
