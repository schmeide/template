import { useQuery } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useTRPC } from "../trpc.ts";
import { statuses, type Asset, type Status } from "./format.ts";

export type AssetFields = {
  readonly name: string;
  readonly tag: string;
  readonly categoryId: number | null;
  readonly status: Status;
  readonly owner: string;
  readonly expiresOn: string | null;
  readonly notes: string;
};

// The fields of an asset, for adding one or editing it. `children` holds the buttons and messages.
export function AssetForm({
  asset,
  label,
  onSubmit,
  children,
}: {
  readonly asset?: Asset;
  readonly label: string;
  readonly onSubmit: (fields: AssetFields) => void;
  readonly children: ReactNode;
}) {
  const trpc = useTRPC();
  const categories = useQuery(trpc.assets.categories.queryOptions());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    onSubmit({
      name: text("name"),
      tag: text("tag"),
      categoryId: text("categoryId") ? Number(text("categoryId")) : null,
      status: text("status") as Status,
      owner: text("owner"),
      expiresOn: text("expiresOn") || null,
      notes: text("notes"),
    });
  };

  return (
    <form onSubmit={submit} aria-label={label} className="assets-form">
      <div className="assets-fields">
        <label>
          Name{" "}
          <input
            name="name"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={asset?.name}
          />
        </label>
        <label>
          Asset tag{" "}
          <input
            name="tag"
            maxLength={100}
            autoComplete="off"
            placeholder="A-1042"
            defaultValue={asset?.tag}
          />
        </label>
        {/* Keyed so the saved category is selected once the options arrive. */}
        <label key={categories.data ? "loaded" : "loading"}>
          Category{" "}
          <select name="categoryId" defaultValue={asset?.categoryId ?? ""}>
            <option value="">None</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status{" "}
          <select name="status" defaultValue={asset?.status ?? "in_use"}>
            {statuses.map((option) => (
              <option key={option.status} value={option.status}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner{" "}
          <input name="owner" maxLength={100} autoComplete="off" defaultValue={asset?.owner} />
        </label>
        <label>
          Expires{" "}
          <input
            name="expiresOn"
            type="date"
            defaultValue={asset?.expiresOn ?? ""}
            aria-describedby="assets-expires-hint"
          />
        </label>
      </div>
      <p id="assets-expires-hint" className="assets-hint">
        A warranty, license or service date. Leave it empty if the asset does not expire.
      </p>
      <label className="assets-notes">
        Notes <textarea name="notes" maxLength={2000} rows={4} defaultValue={asset?.notes} />
      </label>
      {children}
    </form>
  );
}
