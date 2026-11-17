import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "../trpc.ts";
import { browserZone, formatTime, localDate } from "./format.ts";

// The chosen slot travels in the form as "<resourceId>@<ISO start>".
export const readSlot = (data: FormData) => {
  const [resourceId, startsAt] = String(data.get("slot") ?? "").split("@");
  return startsAt ? { resourceId: Number(resourceId), startsAt: new Date(startsAt) } : undefined;
};

const places = (count: number) => (count === 1 ? "1 place left" : `${count} places left`);

// A date (today unless given) and the free times on it for one service, as radio buttons named "slot". The server
// checks the slot again when the form is sent.
export function SlotPicker({
  serviceId,
  defaultDate,
  isClass,
}: {
  readonly serviceId: number | undefined;
  readonly defaultDate?: string;
  readonly isClass: boolean;
}) {
  const trpc = useTRPC();
  const resources = useQuery(trpc.bookings.resources.queryOptions());
  // Today on the business's clock: the first resource's zone.
  const zone = resources.data?.[0]?.timeZone ?? browserZone();
  const [picked, setDate] = useState(defaultDate);
  const date = picked ?? localDate(new Date(), zone);
  const slots = useQuery({
    ...trpc.bookings.slots.queryOptions({ serviceId: serviceId ?? -1, from: date, to: date }),
    enabled: serviceId !== undefined && date !== "",
  });

  return (
    <>
      <label>
        Date{" "}
        <input
          name="date"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <fieldset className="booking-slots">
        <legend>Time</legend>
        {serviceId === undefined ? (
          <p>Pick a service to see its free times.</p>
        ) : slots.error ? (
          <p role="alert">Unable to load free times: {slots.error.message}</p>
        ) : slots.isPending ? (
          <p>Loading free times…</p>
        ) : slots.data.length === 0 ? (
          <p>No free times on this day. Try another date.</p>
        ) : (
          slots.data.map((slot) => (
            <label key={`${slot.resourceId}@${slot.startsAt.toISOString()}`}>
              <input
                type="radio"
                name="slot"
                required
                value={`${slot.resourceId}@${slot.startsAt.toISOString()}`}
              />{" "}
              {formatTime(slot.startsAt, slot.timeZone)}, {slot.resourceName}
              {isClass && `, ${places(slot.seatsLeft)}`}
            </label>
          ))
        )}
      </fieldset>
    </>
  );
}
