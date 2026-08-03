# Walking skeleton: Nest + Fastify + Prisma, one endpoint, proxied, contract-green

Type: task
Status: open
Blocked by: 01

## Question

Prove the whole strategy end to end on the cheapest possible endpoint, before any real
porting starts. Done when a request from the browser reaches Node through the Vite proxy
and the contract suite passes against it.

### Scope

- `gallery-api-node/` as a standalone npm project: NestJS on the Fastify adapter, its own
  TypeScript (independent of the frontend's TS 6), listening on `:4000`.
- Prisma introspecting `gallery_api_development` via `db pull`. Verify it round-trips the
  awkward columns: `images.tags` (`text[]`), `async_tasks.payload` and `.result` (`jsonb`),
  `async_tasks.status` (string-backed enum), the unique index on `images.s3_key`. Do **not**
  run or generate a migration.
- `GET /health` implemented to match Rails' `HealthController#show` byte for byte after
  normalisation.
- `gallery-app/.env.development`: `VITE_API_URL` emptied so requests become relative.
- `gallery-app/vite.config.ts`: add `server.proxy` with `/health` → `:4000`, `/api` →
  `:3000`, `/cable` → `:3000` with `ws: true`.
- Contract suite green against both base URLs.

### Facts to confirm while here

- Vite proxy key matching: prefix-based, and whether first-match-wins follows object
  insertion order. The whole strangler approach depends on a specific path beating the
  `/api` catch-all, so verify rather than assume.
- That the frontend still works fully against Rails through the proxy — same-origin now,
  so `rack-cors` is no longer in the path.
- That Nest 11 and Prisma run clean on Node v24.15.0.

## Answer
