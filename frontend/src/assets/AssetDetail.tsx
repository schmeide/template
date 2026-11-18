import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Slots } from "../App.tsx";
import { useTRPC } from "../trpc.ts";
import { AssetForm } from "./AssetForm.tsx";
import { Attachments } from "./Attachments.tsx";
import { focusOnMount, statusLabel } from "./format.ts";

const formatInstant = (instant: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(instant);

// One asset: its fields to edit, its files, and archive or restore. Only a file is deleted.
export function AssetDetail({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const asset = useQuery(trpc.assets.get.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() });
  const update = useMutation(trpc.assets.update.mutationOptions({ onSuccess: refresh }));
  const archive = useMutation(trpc.assets.archive.mutationOptions({ onSuccess: refresh }));
  const restore = useMutation(trpc.assets.restore.mutationOptions({ onSuccess: refresh }));

  return (
    <main>
      <p>
        <a href="#/assets">Back to all assets</a>
      </p>
      {asset.error && <p role="alert">Unable to load this asset: {asset.error.message}</p>}
      {asset.data && (
        <>
          <h1 ref={focusOnMount} tabIndex={-1}>
            {asset.data.name}
          </h1>
          {asset.data.archivedAt ? (
            <p className="assets-archived">
              This asset was archived on {formatInstant(asset.data.archivedAt)}, so the list leaves
              it out. Restoring it brings it back as {statusLabel(asset.data.status).toLowerCase()}.{" "}
              <button
                // Focus follows the action, since the button pressed has gone.
                ref={archive.isSuccess ? focusOnMount : undefined}
                type="button"
                disabled={restore.isPending}
                onClick={() => restore.mutate({ id })}
              >
                Restore asset
              </button>
            </p>
          ) : (
            <p>
              <button
                ref={restore.isSuccess ? focusOnMount : undefined}
                type="button"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ id })}
              >
                Archive asset
              </button>{" "}
              <span className="assets-hint">
                Archived assets leave the list and can be restored.
              </span>
            </p>
          )}
          {(archive.error ?? restore.error) && (
            <p role="alert">
              Unable to change the asset: {(archive.error ?? restore.error)?.message}
            </p>
          )}
          <h2>Details</h2>
          <AssetForm
            asset={asset.data}
            label="Asset details"
            onSubmit={(fields) => update.mutate({ id, ...fields })}
          >
            <p>
              <button type="submit" disabled={update.isPending}>
                Save asset
              </button>
            </p>
            {update.error && <p role="alert">Unable to save: {update.error.message}</p>}
            <p role="status">{update.isSuccess ? "Saved" : ""}</p>
          </AssetForm>
          <Attachments id={id} />
          <Slots name="asset" id={id} />
        </>
      )}
    </main>
  );
}
