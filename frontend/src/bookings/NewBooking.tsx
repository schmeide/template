import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, minutes } from "./format.ts";
import { readSlot, SlotPicker } from "./SlotPicker.tsx";

export function NewBooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const services = useQuery(trpc.bookings.services.queryOptions());
  const customers = useQuery(trpc.customers.list.queryOptions());
  const [serviceId, setServiceId] = useState<number>();
  const service = services.data?.find((candidate) => candidate.id === serviceId);
  const [everyWeeks, setEveryWeeks] = useState(0);
  const [ends, setEnds] = useState<"count" | "until">("count");
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  const show = (id: number) => window.location.assign(`#/bookings/${id}`);
  const create = useMutation(
    trpc.bookings.create.mutationOptions({
      onSettled: refresh,
      onSuccess: (booking) => show(booking.id),
    })
  );
  const createSeries = useMutation(
    trpc.bookings.createSeries.mutationOptions({
      onSettled: refresh,
      onSuccess: ([first]) => show(first.id),
    })
  );
  const pending = create.isPending || createSeries.isPending;
  const error = everyWeeks > 0 ? createSeries.error : create.error;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slot = readSlot(data);
    if (!slot || serviceId === undefined) return;
    const booking = { ...slot, serviceId, customerId: Number(data.get("customerId")) };
    if (everyWeeks === 0) create.mutate(booking);
    else {
      createSeries.mutate({
        ...booking,
        everyWeeks,
        ...(ends === "count"
          ? { count: Number(data.get("count")) }
          : { until: String(data.get("until")) }),
      });
    }
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        New booking
      </h1>
      {customers.data?.length === 0 && (
        <p>
          Bookings are for customers. <a href="#/customers">Add a customer</a> first.
        </p>
      )}
      <form onSubmit={onSubmit} aria-labelledby="new-booking" className="booking-form">
        <h2 id="new-booking">Who, what and when</h2>
        <label>
          Customer{" "}
          <select name="customerId" required defaultValue="">
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service{" "}
          <select
            name="serviceId"
            required
            value={serviceId ?? ""}
            onChange={(event) => setServiceId(Number(event.target.value))}
          >
            <option value="" disabled>
              Choose a service
            </option>
            {services.data?.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}, {minutes(candidate.durationMinutes)}
              </option>
            ))}
          </select>
        </label>
        <SlotPicker serviceId={serviceId} isClass={(service?.capacity ?? 1) > 1} />
        <label>
          Repeats{" "}
          <select
            value={everyWeeks}
            onChange={(event) => setEveryWeeks(Number(event.target.value))}
          >
            <option value={0}>Does not repeat</option>
            <option value={1}>Every week</option>
            <option value={2}>Every 2 weeks</option>
          </select>
        </label>
        {everyWeeks > 0 && (
          <>
            <label>
              Ends{" "}
              <select
                value={ends}
                onChange={(event) => setEnds(event.target.value === "until" ? "until" : "count")}
              >
                <option value="count">After a number of bookings</option>
                <option value="until">On a date</option>
              </select>
            </label>
            {ends === "count" ? (
              <label>
                Number of bookings{" "}
                <input name="count" type="number" min={2} max={52} defaultValue={4} required />
              </label>
            ) : (
              <label>
                Last date <input name="until" type="date" required />
              </label>
            )}
            <p className="booking-muted">
              Each booking keeps the same time on the clock, for up to 52 bookings or a year. If any
              date is not free, nothing is booked and those dates are named.
            </p>
          </>
        )}
        <p>
          <button type="submit" disabled={pending}>
            Book
          </button>
        </p>
        {error && <p role="alert">Unable to book: {error.message}</p>}
      </form>
    </main>
  );
}
