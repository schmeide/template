import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import { uploadFile } from "../files/upload.ts";
import { useTRPC } from "../trpc.ts";

const formatSize = (bytes: number) => {
  const [value, unit] =
    bytes < 1024 * 1024 ? [bytes / 1024, "kilobyte"] : [bytes / 1024 ** 2, "megabyte"];
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit,
    maximumFractionDigits: 1,
  }).format(value);
};

// An asset's files: download, remove, and add one. Archiving the asset keeps them.
export function Attachments({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const files = useQuery(trpc.assets.files.queryOptions({ id }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.assets.files.queryKey() });
  const remove = useMutation(
    trpc.assets.removeFile.mutationOptions({
      // Focus follows the action, since the button pressed has gone.
      onSuccess: () => {
        document.getElementById("asset-files")?.focus();
        return refresh();
      },
    })
  );
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(`/api/assets/${id}/files`, file),
    onSuccess: refresh,
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still uploads it.
    event.target.value = "";
    if (file) upload.mutate(file);
  };

  return (
    <section aria-labelledby="asset-files">
      <h2 id="asset-files" tabIndex={-1}>
        Files
      </h2>
      {files.error && <p role="alert">Unable to load the files: {files.error.message}</p>}
      {files.data?.length === 0 && (
        <p className="assets-hint">No files yet. Add a receipt, a manual or a photo.</p>
      )}
      {files.data && files.data.length > 0 && (
        <ul className="assets-files">
          {files.data.map((file) => (
            <li key={file.id}>
              <a href={`/api/assets/files/${file.id}`} download={file.name}>
                {file.name}
              </a>{" "}
              <span className="assets-hint">{formatSize(file.size)}</span>{" "}
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  // Removing deletes the file for good, so it asks first.
                  if (window.confirm(`Remove ${file.name}? The file is deleted for good.`)) {
                    remove.mutate({ fileId: file.id });
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {remove.error && <p role="alert">Unable to remove the file: {remove.error.message}</p>}
      <p className="assets-notes">
        <label htmlFor="asset-file">Add a file</label>
        <input id="asset-file" type="file" aria-describedby="asset-file-hint" onChange={onFile} />
        <span id="asset-file-hint" className="assets-hint">
          PDF, image, text, CSV, Word or Excel, up to 10 MB.
        </span>
      </p>
      {upload.error && (
        <p role="alert">
          Unable to add {upload.variables.name}: {upload.error.message}
        </p>
      )}
      <p role="status">
        {upload.isPending
          ? `Adding ${upload.variables.name}…`
          : upload.isSuccess
            ? "File added"
            : ""}
      </p>
    </section>
  );
}
