import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../trpc.ts";
import { AssetForm } from "./AssetForm.tsx";
import { focusOnMount } from "./format.ts";

export function NewAsset() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(
    trpc.assets.create.mutationOptions({
      onSuccess: async (asset) => {
        await queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() });
        window.location.assign(`#/assets/${asset.id}`);
      },
    })
  );

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Add an asset
      </h1>
      <AssetForm label="New asset" onSubmit={(fields) => create.mutate(fields)}>
        <p>
          <button type="submit" disabled={create.isPending}>
            Add asset
          </button>
        </p>
        {create.error && <p role="alert">Unable to add the asset: {create.error.message}</p>}
      </AssetForm>
    </main>
  );
}
