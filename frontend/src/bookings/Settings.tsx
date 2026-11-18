import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { browserZone, focusOnMount, type Outputs } from "./format.ts";

type Resource = Outputs["resources"][number];
type Service = Outputs["services"][number];

const zones = Intl.supportedValuesOf("timeZone");

const readResource = (form: HTMLFormElement) => {
  const data = new FormData(form);
  return {
    name: String(data.get("name")),
    kind: String(data.get("kind")),
    timeZone: String(data.get("timeZone")),
  };
};

const readService = (form: HTMLFormElement) => {
  const data = new FormData(form);
  return {
    name: String(data.get("name")),
    durationMinutes: Number(data.get("durationMinutes")),
    bufferMinutes: Number(data.get("bufferMinutes")),
    capacity: Number(data.get("capacity")),
  };
};

function ResourceFields({ resource }: { readonly resource?: Resource }) {
  const zone = resource?.timeZone ?? browserZone();
  return (
    <>
      <label>
        Name{" "}
        <input
          name="name"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={resource?.name}
        />
      </label>
      <label>
        Kind{" "}
        <input
          name="kind"
          maxLength={100}
          autoComplete="off"
          placeholder="Stylist"
          defaultValue={resource?.kind}
        />
      </label>
      <label>
        Time zone{" "}
        <select name="timeZone" defaultValue={zone}>
          {(zones.includes(zone) ? zones : [zone, ...zones]).map((candidate) => (
            <option key={candidate}>{candidate}</option>
          ))}
        </select>
      </label>
    </>
  );
}

function ServiceFields({ service }: { readonly service?: Service }) {
  return (
    <>
      <label>
        Name{" "}
        <input
          name="name"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={service?.name}
        />
      </label>
      <label>
        Minutes{" "}
        <input
          name="durationMinutes"
          type="number"
          required
          min={1}
          max={1440}
          inputMode="numeric"
          defaultValue={service?.durationMinutes ?? 30}
        />
      </label>
      <label>
        Minutes free after{" "}
        <input
          name="bufferMinutes"
          type="number"
          required
          min={0}
          max={1440}
          inputMode="numeric"
          defaultValue={service?.bufferMinutes ?? 0}
        />
      </label>
      <label>
        Places{" "}
        <input
          name="capacity"
          type="number"
          required
          min={1}
          inputMode="numeric"
          defaultValue={service?.capacity ?? 1}
        />
      </label>
    </>
  );
}

// What can be booked (services) and against what (resources).
export function Settings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const resources = useQuery(trpc.bookings.resources.queryOptions());
  const services = useQuery(trpc.bookings.services.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  const options = { onSuccess: refresh };
  const createResource = useMutation(trpc.bookings.createResource.mutationOptions(options));
  const updateResource = useMutation(trpc.bookings.updateResource.mutationOptions(options));
  const createService = useMutation(trpc.bookings.createService.mutationOptions(options));
  const updateService = useMutation(trpc.bookings.updateService.mutationOptions(options));
  const error =
    createResource.error ?? updateResource.error ?? createService.error ?? updateService.error;
  const saved = updateResource.isSuccess || updateService.isSuccess;

  const onAdd =
    (save: (form: HTMLFormElement, done: () => void) => void) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      save(form, () => form.reset());
    };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Resources and services
      </h1>
      {(resources.error ?? services.error) && (
        <p role="alert">Unable to load: {(resources.error ?? services.error)?.message}</p>
      )}
      {error && <p role="alert">Unable to save: {error.message}</p>}

      <section aria-labelledby="resources">
        <h2 id="resources">Resources</h2>
        <p>
          The people, rooms or equipment that bookings are made with. Hours follow each one's time
          zone.
        </p>
        <ul className="booking-rows">
          {resources.data?.map((resource) => (
            <li key={resource.id}>
              <form
                aria-label={`Resource ${resource.name}`}
                className="booking-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateResource.mutate({ id: resource.id, ...readResource(event.currentTarget) });
                }}
              >
                <ResourceFields resource={resource} />
                <button type="submit">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <form
          aria-labelledby="new-resource"
          className="booking-actions"
          onSubmit={onAdd((form, done) =>
            createResource.mutate(readResource(form), { onSuccess: done })
          )}
        >
          <h3 id="new-resource">Add a resource</h3>
          <ResourceFields />
          <button type="submit" disabled={createResource.isPending}>
            Add resource
          </button>
        </form>
      </section>

      <section aria-labelledby="services">
        <h2 id="services">Services</h2>
        <p>
          What customers book. A service with more than one place is a class: that many people book
          the same time.
        </p>
        <ul className="booking-rows">
          {services.data?.map((service) => (
            <li key={service.id}>
              <form
                aria-label={`Service ${service.name}`}
                className="booking-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateService.mutate({ id: service.id, ...readService(event.currentTarget) });
                }}
              >
                <ServiceFields service={service} />
                <button type="submit">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <form
          aria-labelledby="new-service"
          className="booking-actions"
          onSubmit={onAdd((form, done) =>
            createService.mutate(readService(form), { onSuccess: done })
          )}
        >
          <h3 id="new-service">Add a service</h3>
          <ServiceFields />
          <button type="submit" disabled={createService.isPending}>
            Add service
          </button>
        </form>
      </section>
      <p role="status">{saved ? "Saved" : ""}</p>
    </main>
  );
}
