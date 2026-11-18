import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import "../bookings/bookings.css";
import { formatDay, formatTime, localDate, minutes, statusLabel } from "../bookings/format.ts";
import { readSlot, SlotPicker } from "../bookings/SlotPicker.tsx";
import { useTRPC } from "../trpc.ts";

// Shown on a deal, in the deals shape's "deal" slot: the deal's visits as they now stand, and
// "Book a visit" for the deal's contact.
export function DealVisits({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows a change of contact.
  const deal = useQuery(trpc.deals.get.queryOptions({ id }));
  const visits = useQuery(trpc.visits.list.queryOptions({ itemId: id }));
  const services = useQuery(trpc.bookings.services.queryOptions());
  const [serviceId, setServiceId] = useState<number>();
  const service = services.data?.find((candidate) => candidate.id === serviceId);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.visits.pathKey() });
    await queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  };
  // A taken slot drops out of the picker when the free times reload.
  const book = useMutation(trpc.visits.book.mutationOptions({ onSettled: refresh }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slot = readSlot(new FormData(event.currentTarget));
    if (slot && serviceId !== undefined) book.mutate({ itemId: id, serviceId, ...slot });
  };

  return (
    <section aria-labelledby="deal-visits">
      <h2 id="deal-visits">Visits</h2>
      {visits.error && <p role="alert">Unable to load the visits: {visits.error.message}</p>}
      {visits.data?.length === 0 && <p>No visits booked for this deal yet.</p>}
      {visits.data && visits.data.length > 0 && (
        <ul className="booking-list">
          {visits.data.map((visit) => (
            <li
              key={visit.id}
              className={visit.status === "cancelled" ? "booking-cancelled" : undefined}
            >
              <a href={`#/bookings/${visit.id}`}>
                {formatDay(localDate(visit.startsAt, visit.timeZone))},{" "}
                {formatTime(visit.startsAt, visit.timeZone)}
              </a>
              <p>
                {visit.serviceName} with {visit.resourceName}, {statusLabel(visit.status)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {deal.data &&
        (deal.data.customerId === null ? (
          <p>Choose a contact for this deal to book a visit. The visit is booked for them.</p>
        ) : (
          <details>
            <summary>Book a visit</summary>
            <form onSubmit={onSubmit} aria-label="Book a visit" className="booking-form">
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
                <button type="submit" disabled={book.isPending}>
                  Book visit
                </button>
              </p>
              {book.error && <p role="alert">Unable to book: {book.error.message}</p>}
            </form>
          </details>
        ))}
      <p role="status">{book.isSuccess ? "Visit booked" : ""}</p>
    </section>
  );
}

// Shown on a booking, in the bookings shape's "booking" slot: the deal it is a visit for.
export function BookingDeal({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const deal = useQuery(trpc.visits.deal.queryOptions({ bookingId: id }));

  if (!deal.data) return null;
  return (
    <p>
      A visit for the deal <a href={`#/deals/${deal.data.id}`}>{deal.data.title}</a>
    </p>
  );
}
