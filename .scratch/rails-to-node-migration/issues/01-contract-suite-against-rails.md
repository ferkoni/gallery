# Build the contract suite against Rails

Type: task
Status: resolved
Blocked by: —

## Question

Stand up `contract/` as a standalone npm project and capture golden snapshots of every
Rails endpoint, so that later tickets can prove Node parity per endpoint.

Shape: Vitest + an HTTP client, base URL from an env var, so the same suite runs against
`:3000` (Rails) and `:4000` (Node) unchanged. No knowledge of either stack's internals.

### Endpoints to cover

From `gallery-api/config/routes.rb`:

- `GET /health`
- `POST /api/users`, `POST /api/users/login`, `DELETE /api/users/logout`
- `GET|POST /api/albums`, `GET|PATCH|DELETE /api/albums/:id`
- `GET /api/albums/:album_id/images`
- `GET|POST /api/images`, `GET|PATCH|DELETE /api/images/:id`
- `PUT|DELETE /api/s3_credentials`
- `GET|POST /api/async_tasks`, `GET /api/async_tasks/:id`

Unhappy paths matter as much as happy ones: 401 without a token, 403 for a non-owner, 404
for another user's resource, 422 for validation failures. Capture the response bodies
exactly as Rails emits them — including the inconsistent `{errors: …}` shapes.

### Required to make snapshots stable

- **Normaliser.** Volatile per call: the presigned `url` on every image
  (`X-Amz-Signature`, `X-Amz-Date`, `X-Amz-Credential`, `X-Amz-Expires`), the JWT in the
  login response, `created_at`/`updated_at`, all record ids, and `result.url` on a
  completed `AsyncTask`. Strip or placeholder these before comparing.
- **Deterministic seed data.** Without fixed ids the snapshots churn between runs. Decide
  whether to seed with fixed primary keys or normalise ids away entirely.

### Open sub-question to resolve inside this ticket

Several endpoints hit real S3: image create and destroy, album destroy, the credentials
reachability probe, and the async download. The suite cannot depend on live AWS
credentials. Resolve how those are handled — a local S3-compatible stub, recorded
fixtures, or excluding S3-touching endpoints from snapshot coverage and asserting only
status and error shape. This choice bounds how much parity the suite can actually prove,
so it is the main risk in this ticket.

## Answer

Suite built at `contract/`. Vitest 4, TypeScript, `pg` as the only runtime dependency;
base URL from `CONTRACT_BASE_URL`, so the same suite runs against `:3000` and `:4000`
unchanged. Setup, layout and rationale are in `contract/README.md`.

**Snapshots are deliberately not committed.** They are golden captures of what Rails
actually emits and must be recorded by running the suite against Rails
(`npm run record`). Authoring them by hand would invent the contract rather than
observe it.

### The S3 sub-question, resolved

The premise turned out to be narrower than the ticket assumed. `ImageSerializer`
presigns *locally* — pure crypto, no network call, as the comment on
`Api::ImagesController#serializer_params` states — so every read endpoint produces a
real, assertable URL from seeded fake credentials. Only four paths genuinely reach AWS:

- `POST /api/images`
- `DELETE /api/images/:id`
- `DELETE /api/albums/:id` when the album has images (empty albums short-circuit)
- `PUT /api/s3_credentials`, whose `reachable?` probe runs `head_bucket` +
  `put_object` + `delete_object` unconditionally

**Decision: two tiers.** The default tier covers everything else at full snapshot
fidelity, *plus* every rejection of those four — because validation and Pundit run
before S3 is touched, so "no credentials → 422", "bad MIME → 422", ">25 MB → 422",
"non-owner → 403/404" and "no token → 401" are all free. Only the happy paths sit in
`tests/live-s3.test.ts`, skipped unless `CONTRACT_LIVE_S3=1` with credentials for a
throwaway bucket.

**MinIO and LocalStack were ruled out on a code fact, not a preference.**
`S3::Storage#s3_client` builds `Aws::S3::Client.new(region:, credentials:)` with no
`endpoint:` and no `force_path_style:`, so it cannot be redirected at a local stub
without editing the app — which the map puts out of scope, and which would have to be
mirrored in Node.

### Deterministic seed data, resolved

Runs against a dedicated `gallery_api_contract` database, selected with `POSTGRES_DB`
since `config/database.yml` already reads the development database name from it.
`config.ts` refuses to start if `CONTRACT_DATABASE_URL` names `gallery_api_development`.

**Ids are pinned, not normalised away.** Users are seeded once per run through
`POST /api/users` in fixed order (ids 1–4) and never truncated; every other table is
truncated `RESTART IDENTITY` before each test file and re-seeded with explicit ids and
explicit timestamps. That is what makes `total_count`, `total_pages`, `per_page` and
`created_at DESC` ordering assertable as exact values. Only two things are normalised:
the JWT, and the volatile query parameters of a presigned URL — host and path survive,
so the `s3_key` is still asserted.

Seeding `s3_credentials` cannot go through the API, since `PUT` always probes S3. The
suite therefore writes ActiveRecord Encryption's envelope directly, using the format
established by ticket 02 (`src/support/ar-encryption.ts`, ~40 lines of `node:crypto`).
This has a useful side effect: `tests/s3-credentials.test.ts` asserts that the backend
can decrypt what the suite wrote, which makes the suite a **standing regression test for
whatever ticket 03 decides**. If 03 changes the scheme, that module changes with it.

### Discovered while building: rack-attack is live in development

`config.middleware.use Rack::Attack` is unconditional in `config/application.rb:16` and
development's `cache_store` is `:memory_store`, so the login throttle really applies:
5 `POST /api/users/login` per IP per 60s. A suite that authenticates per test collects
429s within seconds and records garbage as the contract.

The suite spends exactly five logins — three in global setup, two in
`tests/users.test.ts` on a dedicated `authfixture` user — and routes every login through
a pacer that waits out the window rather than letting a 429 be snapshotted. Login also
rotates `users.jti`, so no two suites share a user whose jti one of them rotates.

### Quirks now frozen as contract

Worth listing because each is a place a naive Node port would diverge silently:

- `POST /api/albums` and `POST /api/users` answer **200**; `POST /api/images` and
  `POST /api/async_tasks` answer **201**. `BaseApi#create` renders without a status.
- A stranger's *album* answers **404** (`AlbumsController` overrides `#resource` to scope
  through `#resources`); a stranger's *image* answers **403** (`BaseApi#resource` finds
  unscoped, then Pundit rejects).
- The async tasks index carries **no pagination meta** — `AsyncTasksController#resources`
  never calls `.page`.
- `AsyncTaskSerializer` declares no `:id` attribute, so tasks carry the id only at
  `data.id`, unlike albums, images and users which carry it in both places.
- All three `{errors: …}` shapes: object, bare string, and array.

### Coverage

`tests/health.test.ts`, `users.test.ts`, `albums.test.ts`, `album-images.test.ts`,
`images.test.ts` (including all search/filter/favorites params), `s3-credentials.test.ts`,
`async-tasks.test.ts`, and the gated `live-s3.test.ts`. Every route in
`config/routes.rb` is exercised.
