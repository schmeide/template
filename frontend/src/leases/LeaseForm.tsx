import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useHashPath } from "../App.tsx";
import { focusOnMount, localDay } from "../assets/format.ts";
import { useTRPC } from "../trpc.ts";
import { amountText, parseAmount, rentPeriods, type Lease, type RentPeriod } from "./format.ts";

export type LeaseFields = {
  readonly customerId: number;
  readonly firstDay: string;
  readonly lastDay: string | null;
  readonly rent: number;
  readonly rentPeriod: RentPeriod;
  readonly deposit: number;
  readonly notes: string;
};

// The fields of a lease, for adding one or editing it. `unit` holds the unit picker when adding,
// and `children` the buttons and messages.
export function LeaseForm({
  lease,
  label,
  unit,
  onSubmit,
  children,
}: {
  readonly lease?: Lease;
  readonly label: string;
  readonly unit?: ReactNode;
  readonly onSubmit: (fields: LeaseFields, form: FormData) => void;
  readonly children: ReactNode;
}) {
  const trpc = useTRPC();
  const tenants = useQuery(trpc.customers.list.queryOptions());
  const [amountError, setAmountError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const rent = parseAmount(text("rent"));
    const deposit = text("deposit") === "" ? 0 : parseAmount(text("deposit"));
    if (rent === undefined || deposit === undefined) {
      setAmountError("Enter the rent and deposit as amounts such as 1250 or 1250.50.");
      return;
    }
    setAmountError("");
    onSubmit(
      {
        customerId: Number(text("customerId")),
        firstDay: text("firstDay"),
        lastDay: text("lastDay") || null,
        rent,
        rentPeriod: text("rentPeriod") as RentPeriod,
        deposit,
        notes: text("notes"),
      },
      data
    );
  };

  return (
    <form onSubmit={submit} aria-label={label} className="leases-form">
      <div className="leases-fields">
        {unit}
        {/* Keyed so the saved tenant is selected once the options arrive. */}
        <label key={tenants.data ? "tenants" : "loading tenants"}>
          Tenant{" "}
          <select name="customerId" required defaultValue={lease?.customerId ?? ""}>
            <option value="">Choose a tenant</option>
            {tenants.data?.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          First day <input name="firstDay" type="date" required defaultValue={lease?.firstDay} />
        </label>
        <label>
          Last day{" "}
          <input
            name="lastDay"
            type="date"
            defaultValue={lease?.lastDay ?? ""}
            aria-describedby="leases-last-day-hint"
          />
        </label>
      </div>
      <p id="leases-last-day-hint" className="leases-hint">
        Leave the last day empty for a rolling lease.
      </p>
      <div className="leases-fields">
        <label>
          Rent{" "}
          <input
            name="rent"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="1250.00"
            defaultValue={lease ? amountText(lease.rent) : ""}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "leases-amount-error" : undefined}
          />
        </label>
        <label>
          Rent period{" "}
          <select name="rentPeriod" defaultValue={lease?.rentPeriod ?? "monthly"}>
            {rentPeriods.map(({ period, label }) => (
              <option key={period} value={period}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deposit{" "}
          <input
            name="deposit"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            defaultValue={lease ? amountText(lease.deposit) : ""}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "leases-amount-error" : undefined}
          />
        </label>
      </div>
      {amountError && (
        <p id="leases-amount-error" role="alert">
          {amountError}
        </p>
      )}
      <label className="leases-notes">
        Notes{" "}
        <textarea
          name="notes"
          maxLength={2000}
          rows={3}
          defaultValue={lease?.notes}
          aria-describedby="leases-notes-hint"
        />
      </label>
      <p id="leases-notes-hint" className="leases-hint">
        Name any joint tenants here.
      </p>
      {children}
    </form>
  );
}

// #/leases/new, or #/leases/new/<unit id> to start from a vacant unit.
export function NewLease() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [, , unitPart = ""] = useHashPath();
  const units = useQuery(trpc.leases.units.queryOptions({ today: localDay() }));
  const create = useMutation(
    trpc.leases.create.mutationOptions({
      onSuccess: async (lease) => {
        await queryClient.invalidateQueries({ queryKey: trpc.leases.pathKey() });
        window.location.assign(`#/leases/${lease.id}`);
      },
    })
  );

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Add a lease
      </h1>
      <LeaseForm
        label="New lease"
        unit={
          // Keyed so a unit from the address is selected once the options arrive.
          <label key={units.data ? "units" : "loading units"}>
            Unit{" "}
            <select name="recordId" required defaultValue={unitPart}>
              <option value="">Choose a unit</option>
              {units.data?.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.tag ? `${unit.name} (${unit.tag})` : unit.name}
                </option>
              ))}
            </select>
          </label>
        }
        onSubmit={(fields, form) =>
          create.mutate({ ...fields, recordId: Number(form.get("recordId")) })
        }
      >
        <p>
          <button type="submit" disabled={create.isPending}>
            Add lease
          </button>
        </p>
        {create.error && <p role="alert">Unable to add the lease: {create.error.message}</p>}
      </LeaseForm>
    </main>
  );
}
