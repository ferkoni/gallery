# Gallery

A self-hostable photo management app. Organise images into albums, tag and favourite them, search your library, and download a whole album as a zip. Images live in your own S3 bucket, not on the server. Built with React and Rails.

## Self-hosting

### Requirements

- Docker with the Compose plugin
- `curl` and `openssl` — the install script uses both and exits early if either is missing
- An S3 bucket for image storage, plus an access key that can read and write it

> Image storage is **not** included. Each user enters their own S3 credentials on the Settings page, so an AWS account (or another S3-compatible provider) is required for now. Support for a bundled MinIO service, which would remove that dependency, is planned.

### Install

```bash
mkdir gallery && cd gallery
curl -sSL https://github.com/ferkoni/gallery/releases/latest/download/install.sh | bash
```

The script checks prerequisites, downloads `docker-compose.yml` and `setup.sh`, generates secrets into `.env`, pulls the images, starts everything, and prompts for the email and password of your first account.

The app is then at **http://localhost:8080**. Log in and add your S3 credentials on the Settings page before uploading anything.

Four containers start: `nginx` (serves the built frontend and proxies the API, the only one with a published port), `api`, `worker` (background jobs such as album downloads), and `db` (PostgreSQL, storing its data in a `postgres_data` volume).

### Reaching it from another machine

If you browse the app from anywhere other than the host itself — the usual case for a home server — set `CORS_ALLOWED_ORIGINS` in `.env` to the address you actually type, then restart:

```bash
CORS_ALLOWED_ORIGINS=http://192.168.1.50:8080   # in .env, comma-separated for several
docker compose up -d
```

Skipping this is a quiet failure: pages load and uploads work, but album downloads never finish, because the browser's WebSocket is refused.

### Update

Re-run the install command. `setup.sh` will not overwrite an existing `.env`, the account prompt is skipped once a user exists, and database migrations run automatically on start.

```bash
curl -sSL https://github.com/ferkoni/gallery/releases/latest/download/install.sh | bash
```

### Configuration

All configuration lives in `.env` (created by `setup.sh`, mode `600`):

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Generated on first run |
| `GALLERY_API_DATABASE_PASSWORD` | Generated on first run — the same value as `POSTGRES_PASSWORD`; the database is created with one and connected to with the other, so change both together or neither |
| `SECRET_KEY_BASE` | Generated on first run |
| `ACTIVE_RECORD_ENCRYPTION_*` | Generated on first run — **back these up**, they are the only way to decrypt your stored S3 credentials |
| `CORS_ALLOWED_ORIGINS` | Address(es) you reach the app on — defaults to `http://localhost:8080` |

### Privacy: photo metadata

Photos straight off a phone carry EXIF metadata — GPS coordinates accurate to a few
metres, the capture timestamp, the camera make, model and serial number, and an
embedded thumbnail that is a full second copy of the image. Shared as a link, a photo
shares all of it.

**Gallery strips EXIF from every photo as it is uploaded.** What reaches your bucket is
the image and nothing else. Two things are deliberately kept:

- **The ICC colour profile.** Removing it would make wide-gamut photos render as sRGB —
  a visible desaturation, with no error to explain it.
- **Orientation**, applied to the pixels rather than left as a tag. Portrait photos stay
  portrait.

Two limits worth stating plainly:

- **Photos uploaded before this shipped keep their metadata.** Rewriting objects already
  in your bucket is not something the app does on its own. To clear them, re-upload.
- **Stripping happens server-side**, so the original bytes do travel from your browser to
  your Gallery instance. On a self-hosted install that is your own machine.

### Stop / remove

```bash
docker compose down        # stop containers
docker compose down -v     # stop and delete all data
```

---

## Local development

### Prerequisites

- Ruby 3.4 (see `gallery-api/.ruby-version`)
- Node.js 24 (see `gallery-app/.nvmrc`)
- Docker, for PostgreSQL

PostgreSQL must have the [pgvector](https://github.com/pgvector/pgvector) extension available — `db/schema.rb` enables it, so `db:migrate` and `db:schema:load` both fail without it. The bundled `gallery-api/docker-compose.yml` uses `pgvector/pgvector:pg16` and needs no extra setup; a system-installed PostgreSQL needs the extension added separately.

### API (`gallery-api/`)

```bash
cd gallery-api
bundle install
cp .env.example .env
docker compose up -d   # starts PostgreSQL
rails db:create db:migrate
rails server           # http://localhost:3000
```

See [`gallery-api/README.md`](gallery-api/README.md) for full details.

### Frontend (`gallery-app/`)

```bash
cd gallery-app
npm install
npm run dev            # http://localhost:5173
```

The dev server reads `VITE_API_URL` from `gallery-app/.env.development`, which points at `http://localhost:3000`. In the Docker build it is baked in empty, so the SPA calls the API on its own origin.

See [`gallery-app/README.md`](gallery-app/README.md) for full details.
