# gallery-api

Rails 8.1 API backend for [Gallery](https://github.com/ferkoni/gallery-app) — a self-hostable photo management app with album organisation, image uploads, S3 storage, and async album downloads.

**Sister repo:** [gallery-app](https://github.com/ferkoni/gallery-app) — React/TypeScript frontend.

---

## Features

- JWT authentication with per-session revocation (JTI matcher strategy)
- Image upload to any S3-compatible bucket
- Presigned URLs for private image access — no proxy, no bandwidth cost
- Async album download: streams all images into a zip, uploads to S3 via multipart API, broadcasts completion over ActionCable
- S3 credentials stored per user, encrypted at rest with `ActiveRecord::Encryption`
- Full-text image search by title and tag
- Pagination on all list endpoints

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Rails 8.1 (API-only) |
| Auth | Devise + devise-jwt |
| Storage | AWS S3 (aws-sdk-s3) |
| Serialisation | jsonapi-serializer |
| Background jobs | ActiveJob (Solid Queue) |
| Real-time | ActionCable |
| Database | PostgreSQL |
| Tests | RSpec |

---

## Data model

```
User
├── has_one  S3Credential   (access key + secret, encrypted at rest)
├── has_many Albums
│   └── has_many Images     (s3_key, title, description, tags[], favorited)
└── has_many AsyncTasks     (task_type, status, payload, result)
```

Images are never stored locally — only the S3 key is persisted. Presigned GET URLs are generated on the fly at serialisation time.

---

## API endpoints

All endpoints are under `/api`. Every request except login and register requires `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users` | Register |
| `POST` | `/api/users/login` | Login — returns JWT |
| `DELETE` | `/api/users/logout` | Logout — rotates JTI, invalidating the token |
| `GET` | `/api/albums` | List albums (paginated) |
| `POST` | `/api/albums` | Create album |
| `GET` | `/api/albums/:id` | Get album |
| `PATCH` | `/api/albums/:id` | Update album |
| `DELETE` | `/api/albums/:id` | Delete album and all its S3 objects |
| `GET` | `/api/albums/:id/images` | List images in album (paginated) |
| `GET` | `/api/images` | List images — filterable by `album_id`, `favorited`, `q` (search) |
| `POST` | `/api/images` | Upload image (multipart/form-data) |
| `GET` | `/api/images/:id` | Get image |
| `PATCH` | `/api/images/:id` | Update image metadata |
| `DELETE` | `/api/images/:id` | Delete image and its S3 object |
| `PUT` | `/api/s3_credentials` | Create or update S3 credentials (upsert) |
| `DELETE` | `/api/s3_credentials` | Remove S3 credentials |
| `GET` | `/api/async_tasks` | List async tasks |
| `GET` | `/api/async_tasks/:id` | Get async task status |
| `POST` | `/api/async_tasks` | Enqueue a task (e.g. `album_download`) |

---

## Key design decisions

**JWT revocation via JTI matcher.** Each user row stores a `jti` (JWT ID). Logout rotates it, immediately invalidating any previously issued token — no token blacklist table needed.

**ActionCable authenticated via JWT in `Sec-WebSocket-Protocol`.** Browser WebSocket connections can't carry custom headers, so the token is piggybacked into the `Sec-WebSocket-Protocol` header as `token.<jwt>`. `ApplicationCable::Connection` extracts it, decodes it, and verifies the JTI before the connection is established — the same revocation check that guards HTTP requests. Unauthenticated or expired connections are rejected before any channel subscription is accepted.

**S3 credentials per user, encrypted at rest.** `access_key_id` and `secret_access_key` are encrypted using `ActiveRecord::Encryption` (AES-256-GCM). Credentials are validated against the real bucket on save — bad credentials are rejected before they can cause upload failures later.

**Presigned URLs, not proxied images.** The API never reads image bytes from S3. Instead, the serialiser generates short-lived presigned GET URLs. This keeps the API server stateless and eliminates bandwidth cost for image delivery.

**Async album download with streaming multipart upload.** Downloading an album triggers a background job (`AlbumDownloadJob`) that streams each image from S3 directly into a zip archive, which is simultaneously uploaded back to S3 using the multipart upload API — no disk I/O, no full zip in memory. Completion (or failure) is broadcast to the client over ActionCable. The job retries up to 3 times with polynomial back-off.

**S3 batch delete on album destroy.** Deleting an album removes all S3 objects in batches of 1000 (the S3 API limit) before touching the database, ensuring no orphaned objects accumulate in the bucket.

**Service objects for S3 operations.** All S3 interactions (`Images::Upload`, `Images::Destroy`, `Images::AlbumDestroy`, `Albums::ZipDownload`) are encapsulated in service objects that return a result struct. Controllers only decide what HTTP status to render.

---

## Testing

```bash
bundle exec rspec
```

Coverage is reported by SimpleCov (HTML + summary). Covered areas:

- **Controllers** — all CRUD endpoints for albums, images, async tasks, S3 credentials, and users; authentication and authorisation enforced at the controller layer
- **Services** — `Images::Upload`, `Images::Destroy`, `Images::AlbumDestroy`, `Albums::ZipDownload`; S3 calls are stubbed via the AWS SDK test doubles
- **Models** — validations, associations, and `Filterable` / `Userable` concerns
- **Jobs** — `AlbumDownloadJob` end-to-end (enqueue → run → broadcast)
- **Channels** — `ApplicationCable::Connection` (valid token, expired token, rotated JTI, missing token)

---

## Observability

Two health endpoints:

| Path | What it checks |
|---|---|
| `GET /up` | Rails boot check (returns 200 if the app started without exceptions) |
| `GET /health` | Active DB probe (`SELECT 1`) — returns `{"status":"ok","database":"ok"}` or 503 on failure |

Rate limiting is handled by `rack-attack` (configured in `config/initializers/rack_attack.rb`).

Security scanning runs in CI via `brakeman` (static analysis) and `bundler-audit` (known CVEs in dependencies).

---

## Deployment

The `Dockerfile` is a multi-stage production build (Ruby 3.4 slim base, jemalloc enabled, non-root `rails` user, Thruster HTTP accelerator):

```bash
docker build -t gallery-api .
docker run -d -p 80:80 \
  -e RAILS_MASTER_KEY=<value from config/master.key> \
  --name gallery-api gallery-api
```

For full-stack deployment the project is Kamal-ready (`gem "kamal"` in the Gemfile). For local development only PostgreSQL runs in Docker:

```bash
docker compose up -d   # starts postgres:16-alpine with a persistent volume
```

---

## Development setup

**Requirements:** Ruby 3.4, Docker (for PostgreSQL)

```bash
bundle install
cp .env.example .env
docker compose up -d       # start PostgreSQL
rails db:create db:migrate
rails server               # http://localhost:3000
```

Verify with:

```bash
curl http://localhost:3000/health
```

**Environment variables** (`.env`):

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_USER` | DB username | `gallery_api` |
| `POSTGRES_PASSWORD` | DB password | `gallery_api_password` |
| `POSTGRES_DB` | DB name | `gallery_api_development` |
| `POSTGRES_HOST` | DB host | `localhost` |
| `POSTGRES_PORT` | DB port | `5432` |

---