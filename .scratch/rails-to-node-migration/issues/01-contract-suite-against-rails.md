# Build the contract suite against Rails

Type: task
Status: open
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
