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
  `BaseApi`'s rescues (including `"No S3 credentials on file"`, the 422 every photo read and
  update answers for a user without credentials), and an array from the login failure.
- `POST /api/v1/albums` answering **200**, while `POST /api/v1/images` and
  `POST /api/v1/async_tasks` answer **201**. There is no `POST /api/v1/users`: accounts come from
  a CLI, and the route is a 404.
- An album's `ancestors` appearing only on show and under `?q=`; a plain level listing has no
  `ancestors` key at all.
- Lexical image search (`?q=` with inference off) ranking **newest first**, not by id as
  `Images::Search#lexical_ids` intends: its `.order(:id)` is appended after the index's
  `created_at DESC, id DESC` instead of replacing it.
- A stranger's *album* answering 404 while a stranger's *image* answers 403.
- The async tasks index carrying no pagination `meta` while albums and images do.

Correcting any of these is a separate, post-migration change.

## Setup

The suite owns its database and truncates it, so it must not point at
`gallery_api_development`. Rails in development connects to three databases, and
`config/database.yml` reads each name from an environment variable. Point **all three** at
contract databases: with only `POSTGRES_DB` set, a run would enqueue jobs into the dev queue,
where a dev worker would look for their tasks in the wrong database.

```bash
cd gallery-api
export POSTGRES_DB=gallery_api_contract
export POSTGRES_QUEUE_DB=gallery_api_contract_queue
export POSTGRES_CABLE_DB=gallery_api_contract_cable
bin/rails db:prepare    # creates all three and loads their schemas

cd ../contract
cp .env.example .env
# fill in ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY and _KEY_DERIVATION_SALT
# with the values from gallery-api/.env — they must match exactly
npm install
```

## Running

Start the backend under test against the contract databases, in its own terminal, with
inference off:

```bash
cd gallery-api
POSTGRES_DB=gallery_api_contract POSTGRES_QUEUE_DB=gallery_api_contract_queue \
  POSTGRES_CABLE_DB=gallery_api_contract_cable INFERENCE_MODE=none bin/rails s -p 3000
```

`INFERENCE_MODE=none` makes `?q=` always take the lexical path, which is deterministic and needs
no sidecar or GPU. Semantic and hybrid ranking are not this suite's job: they need a model, and
the search eval proves their parity. With inference off, uploads enqueue no embedding job
either.

Do not start a queue worker. A download the API accepts leaves its task `pending`, and that is
the state the suite asserts. Each run leaves one enqueued job in `gallery_api_contract_queue`,
which the suite does not clear: it truncates only the database it seeds, and knows nothing of
Solid Queue. The jobs are harmless while no worker runs. To clear them,
`bin/rails db:reset:queue` with the same environment.

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

- **Users are inserted once per run** by global setup, with ids 1–4, a fixed `jti`, and a
  committed bcrypt digest of the suite's password (`PASSWORD_DIGEST` in `fixtures.ts`, which says
  how to regenerate it). There is no signup endpoint, and the suite must not know which backend's
  CLI makes accounts. Users are never truncated between test files.
- **Every other table is truncated with `RESTART IDENTITY` before each test file** and re-seeded
  from `src/support/fixtures.ts`, so album, image and task ids are pinned and timestamps are
  explicit. That is what lets `total_count` and ordering be asserted as exact values rather
  than normalised away.
- Three things are normalised, in `src/support/normalise.ts`: the JWT, the volatile query
  parameters of a presigned URL, and **every ISO timestamp**, which becomes `<TIMESTAMP>`. The
  URL's host and path survive, so the `s3_key` is still asserted. The seeded timestamps are
  pinned, so ordering by them is asserted, but their values are not: a backend that serialised
  `created_at` in another format would still pass.

`src/support/db.ts` is the only part that speaks anything but HTTP. It talks to Postgres
directly — no ActiveRecord, no `rails runner` — so it keeps working once Rails is gone.

## The rack-attack budget

`config.middleware.use Rack::Attack` is unconditional in `gallery-api/config/application.rb`,
and development's `cache_store` is `:memory_store`, so the login throttle is **live in
development**: 5 `POST /api/v1/users/login` per IP, and 10 per email, per 60 seconds.

The suite is built to stay inside that budget. It spends exactly five: three in global setup
to mint tokens for `owner`, `stranger` and `nocreds`, and two in `tests/users.test.ts` on the
dedicated `authfixture` user. Every login goes through `login()` in `src/support/auth.ts`,
which paces calls and waits out the window rather than letting a 429 be recorded as the
contract. Re-running the suite inside 60 seconds will make it pause — that is the pacer
working, not a hang. The pacer remembers logins across runs in `.contract-state.json`.

The throttle itself is not in this suite: asserting a 429 spends the budget the rest of the
run needs. `gallery-api/spec/requests/rack_attack_spec.rb` covers it on the Rails side, and the
Node port owns its own. Don't add it here.

## Optional: the expired-token test

`tests/users.test.ts` has one test that signs its own JWT, to check that an expired one answers
401. It is skipped unless `CONTRACT_JWT_SECRET` is set to the backend's signing secret (Rails:
`secret_key_base`, which in development is `gallery-api/tmp/local_secret.txt`).

Logging in rotates `users.jti` and invalidates that user's other tokens. That is deliberate in
the Rails app, so no two suites share a user whose jti one of them rotates.

## The two tiers

**Default tier** — everything that never reaches AWS. This is most of the surface, because
`ImageSerializer` presigns locally: it is pure crypto with no network call, so seeded fake
credentials produce real, assertable URLs.

**Live tier** (`tests/live-s3.test.ts`) — skipped unless `CONTRACT_LIVE_S3=1`. Only four paths
genuinely reach S3: `POST /api/v1/images`, `DELETE /api/v1/images/:id`,
`DELETE /api/v1/albums/:id` when the folder's subtree has images, and
`PUT /api/v1/s3_credentials`, whose reachability probe runs `head_bucket` + `put_object` +
`delete_object` on every call. Their *rejections* are all in the
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
src/support/db.ts              truncate and seed over plain Postgres, and read a few rows back
                               where the API cannot be asked
src/support/http.ts            fetch wrapper (never follows redirects) and the /api/v1 prefix
src/support/auth.ts            token store and the rack-attack pacer
src/support/jwt.ts             signs a token, for the optional expired-token test
src/support/normalise.ts       the normaliser, and idsOf for collection assertions
src/global-setup.ts            once-per-run user seeding and token minting
tests/                         one file per endpoint group
```
