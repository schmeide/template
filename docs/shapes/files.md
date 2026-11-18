# Files

File upload and download, for shapes that keep files with their records. It has a table but no page and no router:
nobody keeps it on its own, and `make shape/keep` refuses to. It comes with the shapes that require it (`assets`).

## What it has

- **Files** (`files`): a name, a type, a size in bytes, the bytes themselves and when it was added.
- **`fileProblem`** and **`saveFile`** (`backend/src/services/files.ts`). `fileProblem` says why an upload cannot be
  kept, in words to show the person who chose it; `saveFile` stores one it accepted and returns it without its bytes.
  It takes a transaction, so a shape can store the file and its link to a record together.
- **`acceptFiles`**, **`readUpload`** and **`sendFile`** (`backend/src/routes/files.ts`), for a shape's Fastify
  plugin (see "Routes" in `shapes/README.md`). `acceptFiles` makes the plugin's routes take one file as the raw
  request body, sent with its own content type and its name in `?name=`. `readUpload` reads that file from a request.
  `sendFile` sends a stored file as a download.
- **`uploadFile`** (`frontend/src/files/upload.ts`) sends a file the browser picked to such a route and throws an
  error with the server's message when it is refused.

## The rules

- **Types.** PDF, JPEG, PNG, WebP, HEIC, plain text, CSV, Word (`.docx`) and Excel (`.xlsx`), listed with their
  content types in `fileLimits` (`backend/src/db/schema/files.ts`). Nothing a browser would run, such as HTML or SVG,
  is allowed. A route answers any other type with 415 before reading the body.
- **Size.** At most 10 MiB a file, and not empty. A route answers a bigger body with 413 as soon as it passes the
  limit. nginx lets bodies up to 16 MiB through to `/api/`, so the backend's limit and message are the ones a
  visitor meets. tRPC routes keep Fastify's 1 MiB limit.
- **Names** are trimmed and at most 255 characters.
- **Downloads** are sent as attachments with `X-Content-Type-Options: nosniff`, so a browser saves the file rather
  than opening it as a page.
- **Only through a record.** This shape has no route of its own. A shape that takes files links them from its own
  table and serves a file only through that link, so a file nobody attached cannot be downloaded.

## Taking files in a shape

1. Add a link table to the shape's schema: a `file_id` referencing `files.id` with `onDelete: "cascade"`, and the
   record it belongs to.
2. In the service, store the file with `saveFile` and the link in one transaction. Removing a file deletes its
   `files` row; the cascade removes the link.
3. Add a Fastify plugin in `backend/src/routes/<shape>.ts` that calls `acceptFiles`, and list it under `routes` in
   the shape's manifest (then `make shape/registries`). Its download route reads the file through the link table and
   calls `sendFile`.
4. Use `uploadFile` in the page, and an ordinary link to the download route.

The `assets` shape does all four for its attachments.

## Limits

- The bytes are stored in Postgres, which needs no volume or setting of its own and is backed up with everything
  else. That suits a few gigabytes in all. Past that, move the bytes to object storage (an S3-compatible bucket keyed
  by the file's id) and keep the table for the name, type and size. The schema carries a `ponytail:` comment.
- A file is read whole into memory on upload and download, which suits files of this size.
- The type is the one the browser sends, worked out from the file's extension. Nothing checks the bytes.
- The page does not filter the file picker by type, because the list lives in the backend; the server's message
  names the types it takes.
