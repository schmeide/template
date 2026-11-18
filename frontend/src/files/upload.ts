// Sends one file as the request body, as a route using `acceptFiles` (backend/src/routes/files.ts)
// takes it, and returns the reply. Throws an Error with the server's message when it refuses.
export const uploadFile = async (url: string, file: File): Promise<unknown> => {
  const response = await fetch(`${url}?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    // A browser leaves the type empty when it does not know it; the server then names the types
    // it takes.
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (body as { readonly message?: unknown } | undefined)?.message;
    throw new Error(
      typeof message === "string" ? message : `The upload failed (${response.status}). Try again.`
    );
  }
  return body;
};
