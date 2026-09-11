# Gallery

A self-hostable photo management app. Organise images into albums, tag and favourite them, search your library, and download a whole album as a zip. Images live in your own S3 bucket, not on the server. Built with React and Rails.

## Self-hosting

### Requirements

- Docker with the Compose plugin
- `curl` and `openssl` — the install script uses both and exits early if either is missing
- An S3 bucket for image storage, plus an access key that can read and write it
- Optional, for AI search: an x86-64 host, ideally with an NVIDIA GPU — see [Enabling AI search](#enabling-ai-search)

> Image storage is **not** included. Each user enters their own S3 credentials on the Settings page, so an AWS account (or another S3-compatible provider) is required for now. Support for a bundled MinIO service, which would remove that dependency, is planned.

### Install

```bash
mkdir gallery && cd gallery
curl -sSL https://github.com/ferkoni/gallery/releases/latest/download/install.sh | bash
```

The script checks prerequisites, downloads `docker-compose.yml`, `docker-compose.cpu.yml` and `setup.sh`, generates secrets into `.env`, pulls the images, starts everything, and prompts for the email and password of your first account.

The app is then at **http://localhost:8080**. Log in and add your S3 credentials on the Settings page before uploading anything.

Four containers start: `nginx` (serves the built frontend and proxies the API, the only one with a published port), `api`, `worker` (background jobs such as album downloads), and `db` (PostgreSQL, storing its data in a `postgres_data` volume). A fifth, `inference`, runs the optional AI search and does not start by default — see [Enabling AI search](#enabling-ai-search).

### Reaching it from another machine

If you browse the app from anywhere other than the host itself — the usual case for a home server — set `CORS_ALLOWED_ORIGINS` in `.env` to the address you actually type, then restart:

```bash
CORS_ALLOWED_ORIGINS=http://192.168.1.50:8080   # in .env, comma-separated for several
docker compose up -d
```

Skipping this is a quiet failure: pages load and uploads work, but album downloads never finish, because the browser's WebSocket is refused.

### Enabling AI search

By default, search matches photo titles and tags. AI search also finds photos by what is in them — "dog on a beach" finds that photo whatever it is called. On a 235-photo personal library it moved P@5 from 0.05 to 0.62 against a hand-judged answer key ([`eval/README.md`](eval/README.md)).

It runs in a fifth container, `inference`, which does not start unless you ask for it. Set both of these in `.env`:

```bash
INFERENCE_MODE=local
COMPOSE_PROFILES=inference
```

An `.env` from a recent install already has them, switched off, under an `# AI search` comment; an older one needs them added. Then:

```bash
docker compose up -d
```

That starts `inference` and recreates `api` and `worker`, which read `INFERENCE_MODE`. `docker compose ps` now lists five containers.

**Both lines are needed, and either one alone fails silently.** `COMPOSE_PROFILES` without `INFERENCE_MODE=local` runs a healthy container that nothing uses. `INFERENCE_MODE=local` without the container leaves search on titles and tags, and stores new uploads without indexing them; the only sign is a warning in `docker compose logs api` at startup: `inference: dimension check skipped, adapter unavailable`.

The first start downloads about 1.4 GB of model weights. While it does, `docker compose ps` shows `inference` as `health: starting` and then, after about three minutes, `unhealthy` — expected until the download finishes, after which it turns `healthy` on its own (5 to 12 minutes in testing, depending on the connection). Once it is healthy, index the photos you already have — including any uploaded while it was starting:

```bash
docker compose exec api bin/rails inference:backfill   # queues the work
docker compose exec api bin/rails inference:status     # progress
```

Hardware:

- **An NVIDIA GPU is used if there is one** and Docker can reach it (the NVIDIA Container Toolkit). Otherwise, also set this in `.env` to run the container on the CPU — about 3x slower per photo, which for a personal library means a longer backfill rather than a slower gallery:
  ```bash
  COMPOSE_FILE=docker-compose.yml:docker-compose.cpu.yml
  ```
  Its log then opens with `WARNING: The NVIDIA Driver was not detected`. That is expected on this path, and harmless.
- **AMD, Intel and Apple GPUs are not used.** Those hosts take the CPU path above.
- **x86-64 only.** The image is not built for ARM, so a Raspberry Pi, an ARM NAS or VPS, or an Apple Silicon Mac cannot run AI search yet. The rest of the gallery is unaffected.
- **The image is a multi-GB download**, on the CPU path too.

Everything about the container itself — the model, its API, its settings and benchmarks — is in [`sidecar/README.md`](sidecar/README.md).

### Update

Re-run the install command. `setup.sh` will not overwrite an existing `.env`, the account prompt is skipped once a user exists, and database migrations run automatically on start. With AI search enabled, this updates `inference` too; there is nothing extra to run.

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
| `INFERENCE_MODE` | `none` (default) or `local` — see [Enabling AI search](#enabling-ai-search) |
| `COMPOSE_PROFILES` | `inference` starts the AI search container; nothing uses it unless `INFERENCE_MODE=local` |
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.cpu.yml` runs that container on the CPU, for hosts without an NVIDIA GPU |
| `INFERENCE_ENDPOINT` | Defaults to `http://inference:8000`; change it only to use an AI search container running elsewhere |
| `MODEL_NAME` | Defaults to `xlm-roberta-base-ViT-B-32`; read [`sidecar/README.md`](sidecar/README.md) before changing this or the next |
| `MODEL_PRETRAINED` | Defaults to `laion5b_s13b_b90k` |

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

PostgreSQL must have the [pgvector](https://github.com/pgvector/pgvector) extension available, **version 0.8 or later** — `db/schema.rb` enables it, so `db:migrate` and `db:schema:load` both fail without it. The 0.8 minimum is for iterative index scans, which keep filtered vector search from silently returning too few rows. The bundled `gallery-api/docker-compose.yml` uses `pgvector/pgvector:0.8.6-pg16` and needs no extra setup; a system-installed PostgreSQL needs the extension added separately.

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
