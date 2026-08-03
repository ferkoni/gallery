# Map: Rails to Node.js backend migration

## Destination

`gallery-app` runs against a Node/TypeScript backend that has fully replaced `gallery-api`
at feature parity — including real-time download notifications, which means replacing
`@rails/actioncable` on the frontend too. Rails is retired from the serving path but
preserved as a showcase of how the migration was done.

Reached when the frontend suite and the contract suite both pass against the Node backend
alone, and Rails is no longer needed to run the app.

## Notes

**Domain.** Monorepo at `/home/fernando/Documents/gallery`. `gallery-app/` is React 19 +
Vite 8 + TS 6 + Vitest 4, with 100%-per-file coverage thresholds. `gallery-api/` is the
Rails 8.1 API being replaced. Postgres runs locally: `gallery_api_development` plus a
dedicated `gallery_api_development_cable` for Solid Cable. Node v24.15.0, npm 11.12.1,
no pnpm.

**This map carries execution.** Wayfinder is planning-only by default; this effort
overrides that. Tickets resolve decisions *and* include de-risk spikes that build the
genuinely risky parts. The mechanical endpoint-by-endpoint porting is deliberately **not**
ticketed — it hands off as ordinary work once the route is clear.

**Learning goal.** The point of this migration is to learn Node and an opinionated Node
framework. Where a choice is close, prefer the option that teaches more or is
more employable over the one that ships fastest. Framework magic is welcome, not a
compromise to minimise.

### Settled before charting

Constraints every session inherits. These came out of the destination and frontier grills,
not from tickets, so they are not in Decisions-so-far.

1. **Framework:** NestJS on the Fastify adapter.
2. **ORM:** Prisma, introspecting the existing schema (`prisma db pull`). It owns **no
   migrations** until Rails is gone — one destructive migration against
   `gallery_api_development` destroys the dev data both backends are using.
3. **Cutover mechanism:** Vite's dev-server proxy (`server.proxy` in
   `gallery-app/vite.config.ts`), routing per path prefix. `VITE_API_URL` becomes empty so
   requests go to the Vite origin as relative paths. Porting an endpoint is a one-line
   config edit; reverting is the same line. `ws: true` lets `/cable` move independently of
   the REST endpoints. Specific paths must precede the `/api` catch-all.
4. **Shared database.** A consequence of per-endpoint splitting, not a free choice: both
   backends serve one app session, so they must read one Postgres.
5. **Parity by golden snapshot.** The contract suite captures normalised Rails responses
   and asserts Node reproduces them. This **deliberately freezes Rails' quirks as the
   contract**, including `jsonapi-serializer` emitting `id` in both `data.id` and
   `data.attributes.id`. Correcting quirks is a separate post-migration change.
6. **Layout:** `gallery-api-node/` and `contract/` as standalone sibling projects, each
   with its own `package.json`. No npm workspaces. Rails keeps `gallery-api/` until
   cutover — renaming it now would silently break the `gallery-api/**` path filter in
   `.github/workflows/gallery-api-ci.yml`.
7. **Same-origin side effect.** Proxying makes dev requests same-origin, so `rack-cors`
   stops being exercised. Only matters once production infra is in scope, which it is not.

### Terminology

**Contract suite** — a stack-agnostic HTTP test suite that runs against a *running*
backend at a given base URL, asserting observable behaviour: status codes, response shape,
auth rejection, ownership scoping, pagination metadata. It knows nothing about Rails or
Node internals. Point it at `:3000` and it passes; point it at `:4000` and it passes
identically. Lives in `contract/`, outlives the migration, and closes the "controller
specs instead of request specs" gap recorded in `~/Documents/docs/gallery/unbuilt-work.md`
§3.

### Skills to consult

`/research` for ecosystem facts, `/prototype` for spikes, `/grill-with-docs` for decision
tickets, `/tdd` when porting behaviour that already has Rails specs to mirror.

### Standing preferences

- Never `git commit` unless explicitly asked. Staging is fine.
- Never run migrations or test suites on the user's behalf — write files, then stop.
- Report file changes as a path list with a one-line description each; no inline diffs.
- No alignment/padding spaces in generated code.
- Do not start implementing during a design discussion; wait for explicit go-ahead.

### Reference

- `~/Documents/docs/gallery/unbuilt-work.md` — deferred work and open findings; §3 lists
  Rails-side issues that retire with the Rails app
- `~/Documents/docs/gallery/album-download-feature/feature-explanation.md` — how the
  streaming zip works today; the reference for ticket 08
- `~/Documents/docs/gallery/backend-interview-topics.md` — describes the Rails design
  being replaced, useful when judging what parity means

## Decisions so far

<!-- one line per resolved ticket: gist + link. Nothing resolved yet. -->

## Not yet specified

In scope, not yet sharp enough to ticket. Graduates as the frontier advances.

- **Error-response shape parity.** The Rails API returns `{errors: …}` as an object
  (`resource.errors`), a bare string (`"Not found"`), and an array (`["Invalid email or
  password"]`) depending on the path. Whether Node reproduces all three shapes or the
  snapshots force a decision is unclear until the suite exists.
- **Kaminari `meta` reproduction.** `current_page`/`total_pages`/`total_count`/`per_page`
  must match exactly, including the default page size and out-of-range page behaviour.
- **Pundit → Nest guards.** Whether the five policies map one-to-one onto guards or want a
  policy abstraction. Depends on how much ownership logic the Prisma query layer absorbs.
- **The `Images::Result` pattern.** Nest prefers exceptions and filters; the Rails services
  return a `Result` data object. Unresolved whether the port keeps result objects.
- **Multipart upload semantics.** Fastify's multipart handling versus Rails'
  `ActionDispatch::Http::UploadedFile` — content type, size limits, streaming to S3.
- **rack-attack's dual throttle.** Whether the IP + email login throttle is reproduced,
  and with what (in-memory, Postgres, Redis).
- **`AsyncTask.processing`.** Defined in the Rails enum but never set. Whether Node
  implements it or the status is dropped.
- **Frontend coverage through the WebSocket swap.** `gallery-app` enforces 100% per-file
  coverage; replacing `useUserChannel` and the ActionCable client must land with tests.

## Out of scope

Ruled beyond this destination. Does not graduate.

- **Infrastructure and deployment** — the unmerged `docker-setup` branch, CI workflows, the
  SQS worker, self-hosting, production nginx. The Vite proxy is a dev-only facade;
  production routing is a later effort.
- **Everything in `unbuilt-work.md`** — MinIO/custom endpoint support, the S3-key refactor,
  thumbnails, public albums, EXIF, bulk operations, trash, full-text search. The Node port
  inherits the `albums/<id>/<uuid>/` key format unchanged, which is correct for a parity
  migration.
- **Rails-side open review findings** (`unbuilt-work.md` §3) — they retire with the Rails
  app or get re-litigated as Node decisions.
