import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Slots } from "../App.tsx";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDay, formatTime, localDate, statuses, statusLabel } from "./format.ts";
import { readSlot, SlotPicker } from "./SlotPicker.tsx";

const bookingCount = (count: number) => (count === 1 ? "1 booking" : `${count} bookings`);

export function BookingDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const booking = useQuery(trpc.bookings.get.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  const setStatus = useMutation(trpc.bookings.setStatus.mutationOptions({ onSettled: refresh }));
  const move = useMutation(trpc.bookings.move.mutationOptions({ onSettled: refresh }));
  const moveSeries = useMutation(trpc.bookings.moveSeries.mutationOptions({ onSettled: refresh }));
  const customers = useQuery(trpc.customers.list.queryOptions());
  const changeCustomer = useMutation(
    trpc.bookings.changeCustomer.mutationOptions({ onSettled: refresh })
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelSeries = useMutation(
    trpc.bookings.cancelSeries.mutationOptions({
      onSettled: refresh,
      onSuccess: () => setConfirmingCancel(false),
    })
  );

  const onStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("status"));
    const status = statuses.find((candidate) => candidate.value === value)?.value;
    if (status) setStatus.mutate({ id, status });
  };

  const onMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slot = readSlot(data);
    if (!slot) return;
    if (data.has("later")) moveSeries.mutate({ id, ...slot });
    else move.mutate({ id, ...slot });
  };

  const onCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const customerId = Number(new FormData(event.currentTarget).get("customerId"));
    if (booking.data && customerId) {
      changeCustomer.mutate({ id, fromCustomerId: booking.data.customerId, customerId });
    }
  };

  const data = booking.data;
  const open = data?.status === "booked" || data?.status === "confirmed";
  const moving = move.isPending || moveSeries.isPending;
  const moveError = move.error ?? moveSeries.error;
  // The open bookings from this one on, which "Cancel this and later bookings" cancels.
  const later = (data?.series ?? []).filter(
    (occurrence) =>
      data !== undefined &&
      occurrence.startsAt >= data.startsAt &&
      (occurrence.status === "booked" || occurrence.status === "confirmed")
  ).length;

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
          <Slots name="booking" id={id} />
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
          {data.series.length > 0 && (
            <section aria-labelledby="booking-series" className="booking-form">
              <h2 id="booking-series">Repeats</h2>
              <ol aria-label="Bookings in this series" className="booking-list">
                {data.series.map((occurrence) => (
                  <li key={occurrence.id}>
                    <a
                      href={`#/bookings/${occurrence.id}`}
                      aria-current={occurrence.id === id ? "page" : undefined}
                    >
                      {formatDay(localDate(occurrence.startsAt, occurrence.timeZone))},{" "}
                      {formatTime(occurrence.startsAt, occurrence.timeZone)}
                    </a>
                    , {statusLabel(occurrence.status)}
                  </li>
                ))}
              </ol>
              {open && !confirmingCancel && (
                <button type="button" onClick={() => setConfirmingCancel(true)}>
                  Cancel this and later bookings
                </button>
              )}
              {open && confirmingCancel && (
                <>
                  <p ref={focusOnMount} tabIndex={-1}>
                    Cancel {bookingCount(later)}? Their times become free for others, and this
                    cannot be undone.
                  </p>
                  <div className="booking-actions">
                    <button
                      type="button"
                      disabled={cancelSeries.isPending}
                      onClick={() => cancelSeries.mutate({ id })}
                    >
                      Cancel {bookingCount(later)}
                    </button>
                    <button type="button" onClick={() => setConfirmingCancel(false)}>
                      Keep bookings
                    </button>
                  </div>
                </>
              )}
              {cancelSeries.error && (
                <p role="alert">Unable to cancel: {cancelSeries.error.message}</p>
              )}
            </section>
          )}
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
              {data.series.length > 0 && (
                <label>
                  <input type="checkbox" name="later" /> Move the later bookings too
                </label>
              )}
              <p>
                <button type="submit" disabled={moving}>
                  Move booking
                </button>
              </p>
              {moveError && <p role="alert">Unable to move: {moveError.message}</p>}
            </form>
          )}
          <form
            key={data.customerId}
            onSubmit={onCustomer}
            aria-labelledby="booking-customer"
            className="booking-form"
          >
            <h2 id="booking-customer">Change customer</h2>
            <label>
              Customer{" "}
              <select name="customerId" required defaultValue="" aria-describedby="customer-help">
                <option value="" disabled>
                  Choose a customer
                </option>
                {customers.data
                  ?.filter((customer) => customer.id !== data.customerId)
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.email ? `${customer.name}, ${customer.email}` : customer.name}
                    </option>
                  ))}
              </select>
            </label>
            <p id="customer-help" className="booking-muted">
              The time and status stay as they are, and {data.customer.name} stays in your
              customers.
            </p>
            <p>
              <button type="submit" disabled={changeCustomer.isPending}>
                Change customer
              </button>
            </p>
            {changeCustomer.error && (
              <p role="alert">Unable to change the customer: {changeCustomer.error.message}</p>
            )}
          </form>
          <p role="status">
            {changeCustomer.isSuccess
              ? "Customer changed"
              : setStatus.isSuccess
                ? "Status saved"
                : move.isSuccess
                  ? "Booking moved"
                  : moveSeries.isSuccess
                    ? "Bookings moved"
                    : cancelSeries.isSuccess
                      ? "Bookings cancelled"
                      : ""}
          </p>
        </>
      )}
    </main>
  );
}
