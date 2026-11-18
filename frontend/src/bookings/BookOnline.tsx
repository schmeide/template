import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount, formatDay, formatTime, localDate, minutes } from "./format.ts";
import { readSlot, SlotPicker } from "./SlotPicker.tsx";
import "./bookings.css";

// The public page: a customer picks a service and a free time and leaves their details. It needs
// no sign-in, so it only calls procedures that say nothing about other customers.
export function BookOnline() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const services = useQuery(trpc.bookings.services.queryOptions());
  const [serviceId, setServiceId] = useState<number>();
  const service = services.data?.find((candidate) => candidate.id === serviceId);
  const book = useMutation(
    trpc.bookings.book.mutationOptions({
      // A taken slot drops out of the list, so the next pick is a free one.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.bookings.slots.pathKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slot = readSlot(data);
    if (!slot || serviceId === undefined) return;
    const text = (name: string) => String(data.get(name));
    book.mutate({
      ...slot,
      serviceId,
      name: text("name"),
      email: text("email"),
      phone: text("phone"),
    });
  };

  if (book.data) {
    const { serviceName, resourceName, startsAt, timeZone } = book.data;
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          You are booked
        </h1>
        <p>
          {serviceName} with {resourceName} on {formatDay(localDate(startsAt, timeZone))} at{" "}
          {formatTime(startsAt, timeZone)}.
        </p>
        <p>
          <button type="button" onClick={() => book.reset()}>
            Book another
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Book online
      </h1>
      {services.error && <p role="alert">Unable to load services: {services.error.message}</p>}
      {services.data?.length === 0 && <p>Nothing can be booked online yet.</p>}
      <form onSubmit={onSubmit} aria-labelledby="book-what" className="booking-form">
        <h2 id="book-what">Choose a time</h2>
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
        <h2>Your details</h2>
        <label>
          Name <input name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label>
          Email{" "}
          <input
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            placeholder="name@example.com"
          />
        </label>
        <label>
          Phone (optional) <input name="phone" type="tel" maxLength={50} autoComplete="tel" />
        </label>
        <p>
          <button type="submit" disabled={book.isPending}>
            Book
          </button>
        </p>
        {book.error && <p role="alert">Unable to book: {book.error.message}</p>}
      </form>
    </main>
  );
}
