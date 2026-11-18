# Rate limit

A per-address limit for public forms anyone on the internet can send. It has no tables and no page: nobody keeps it
on its own, and `make shape/keep` refuses to. It comes with the shapes that require it (`requests` and `orders`).

## What it has

- **`takePublicSlot`** (`backend/src/services/rateLimit.ts`) allows five submissions per key per ten minutes. A
  router calls it with the visitor's address prefixed by its form's name (`requests 203.0.113.7`), so each form
  counts on its own, and answers `TOO_MANY_REQUESTS` when it says no.
- The address is `ctx.ip`, from `X-Real-IP`, which `frontend/nginx.conf` sets to the address nginx saw.

## Limits

- The count lives in the backend's memory: it resets on restart and each replica counts on its own. Move it to a
  shared store (Postgres or Redis) or the platform's edge when the app runs more than one.
- Behind another proxy every visitor shares that proxy's address. Read the edge's forwarded header then.
