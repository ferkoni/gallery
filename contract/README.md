# Contract suite

A stack-agnostic HTTP test suite. It runs against a *running* backend at a base URL and
asserts observable behaviour only — status codes, response shapes, auth rejection, ownership
scoping, pagination metadata. It knows nothing about Rails or Node internals, so the same
suite proves parity for both.

Point it at `:3000` and it passes. Point it at `:4000` and it must pass identically.

## Why the snapshots are recorded, not written

The snapshots are golden captures of what **Rails actually emits**. They must be recorded by
running the suite against Rails — writing them by hand would mean inventing the contract
instead of observing it. `__snapshots__/` is empty until you do that.

The suite deliberately freezes Rails' quirks as the contract, including:

- `jsonapi-serializer` emitting the id in both `data.id` and `data.attributes.id` for albums,
  images and users — but **not** for async tasks, whose serializer declares no `:id` attribute.
- Three different `{errors: …}` shapes: an object from validation failures, a bare string from
  `BaseApi`'s rescues, and an array from the login failure.
- `POST /api/albums` and `POST /api/users` answering **200**, while `POST /api/images` and
  `POST /api/async_tasks` answer **201**.
- A stranger's *album* answering 404 while a stranger's *image* answers 403.
- The async tasks index carrying no pagination `meta` while albums and images do.

Correcting any of these is a separate, post-migration change.

## Setup

The suite owns its database and truncates it, so it must not point at
`gallery_api_development`. `config/database.yml` reads the development database name from
`POSTGRES_DB`, so switching is one environment variable.

```bash
createdb gallery_api_contract

cd gallery-api
POSTGRES_DB=gallery_api_contract bin/rails db:schema:load

cd ../contract
cp .env.example .env
# fill in ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY and _KEY_DERIVATION_SALT
# with the values from gallery-api/.env — they must match exactly
npm install
```

## Running

Start the backend under test against the contract database, in its own terminal:

```bash
cd gallery-api
POSTGRES_DB=gallery_api_contract bin/rails s -p 3000
```

Then record the golden snapshots from Rails:

```bash
cd contract
npm run record
```

Review what was recorded — that diff *is* the contract — and commit it. From then on:

```bash
npm run test:rails    # must stay green
npm run test:node     # the parity assertion, once :4000 exists
```

## How state is managed

- **Users are seeded once per run** via `POST /api/users`, in a fixed order, so their ids are
  1–4. They are never truncated between test files.
- **Every other table is truncated with `RESTART IDENTITY` before each test file** and re-seeded
  from `src/support/fixtures.ts`, so album, image and task ids are pinned and timestamps are
  explicit. That is what lets `total_count` and ordering be asserted as exact values rather
  than normalised away.
- Only two things are normalised, in `src/support/normalise.ts`: the JWT, and the volatile
  query parameters of a presigned URL. The URL's host and path survive, so the `s3_key` is
  still asserted.

`src/support/db.ts` is the only part that speaks anything but HTTP. It talks to Postgres
directly — no ActiveRecord, no `rails runner` — so it keeps working once Rails is gone.

## The rack-attack budget

`config.middleware.use Rack::Attack` is unconditional in `gallery-api/config/application.rb`,
and development's `cache_store` is `:memory_store`, so the login throttle is **live in
development**: 5 `POST /api/users/login` per IP per 60 seconds.

The suite is built to stay inside that budget. It spends exactly five: three in global setup
to mint tokens for `owner`, `stranger` and `nocreds`, and two in `tests/users.test.ts` on the
dedicated `authfixture` user. Every login goes through `login()` in `src/support/auth.ts`,
which paces calls and waits out the window rather than letting a 429 be recorded as the
contract. Re-running the suite inside 60 seconds will make it pause — that is the pacer
working, not a hang.

Logging in rotates `users.jti` and invalidates that user's other tokens. That is deliberate in
the Rails app, so no two suites share a user whose jti one of them rotates.

## The two tiers

**Default tier** — everything that never reaches AWS. This is most of the surface, because
`ImageSerializer` presigns locally: it is pure crypto with no network call, so seeded fake
credentials produce real, assertable URLs.

**Live tier** (`tests/live-s3.test.ts`) — skipped unless `CONTRACT_LIVE_S3=1`. Only four paths
genuinely reach S3: `POST /api/images`, `DELETE /api/images/:id`, `DELETE /api/albums/:id` when
the album has images, and `PUT /api/s3_credentials`, whose reachability probe runs
`head_bucket` + `put_object` + `delete_object` on every call. Their *rejections* are all in the
default tier, because validation and Pundit run before S3 is touched — only the happy paths
need credentials.

Running the live tier needs a throwaway bucket. It writes and deletes objects in it.

MinIO and LocalStack are not an option without changing the app: `S3::Storage#s3_client` builds
`Aws::S3::Client.new(region:, credentials:)` with no `endpoint:` or `force_path_style:`, so it
cannot be pointed anywhere else.

## Layout

```
src/support/config.ts          env and the guard against pointing at the dev database
src/support/fixtures.ts        the seeded data, with pinned ids and timestamps
src/support/ar-encryption.ts   writes ActiveRecord Encryption's envelope, so credentials
                               can be seeded without going through the S3-probing endpoint
src/support/db.ts              truncate and seed over plain Postgres
src/support/http.ts            fetch wrapper
src/support/auth.ts            token store and the rack-attack pacer
src/support/normalise.ts       the normaliser
src/global-setup.ts            once-per-run user registration and token minting
tests/                         one file per endpoint group
```
