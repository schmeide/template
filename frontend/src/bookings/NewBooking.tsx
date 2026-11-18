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
  const create = useMutation(
    trpc.bookings.create.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() }),
      onSuccess: (booking) => window.location.assign(`#/bookings/${booking.id}`),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slot = readSlot(data);
    if (!slot || serviceId === undefined) return;
    create.mutate({ ...slot, serviceId, customerId: Number(data.get("customerId")) });
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
        <p>
          <button type="submit" disabled={create.isPending}>
            Book
          </button>
        </p>
        {create.error && <p role="alert">Unable to book: {create.error.message}</p>}
      </form>
    </main>
  );
}
