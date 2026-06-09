# Gallery

A self-hostable photo management app with album organisation, image uploads, and S3 storage. Built with React and Rails.

## Self-hosting

### Requirements

- Docker with the Compose plugin
- An S3-compatible bucket for image storage

### Install

```bash
mkdir gallery && cd gallery

curl -sSL https://github.com/OWNER/gallery/releases/latest/download/docker-compose.yml -o docker-compose.yml
curl -sSL https://github.com/OWNER/gallery/releases/latest/download/setup.sh -o setup.sh

chmod +x setup.sh && ./setup.sh
```

`setup.sh` generates secrets, pulls the images, and starts all services. The app will be available at **http://localhost:8080**.

### Update

Re-download `docker-compose.yml` and re-run `setup.sh`. Your `.env` (including all secrets) is not touched on subsequent runs.

```bash
curl -sSL https://github.com/OWNER/gallery/releases/latest/download/docker-compose.yml -o docker-compose.yml
./setup.sh
```

### Configuration

All configuration lives in `.env` (created by `setup.sh`):

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Generated on first run |
| `SECRET_KEY_BASE` | Generated on first run |
| `ACTIVE_RECORD_ENCRYPTION_*` | Generated on first run |
| `CORS_ALLOWED_ORIGINS` | URL(s) used to reach the app — defaults to `http://localhost:8080` |

After first install, configure S3 credentials from the app's Settings page.

### Stop / remove

```bash
docker compose down        # stop containers
docker compose down -v     # stop and delete all data
```

---

## Local development

### Prerequisites

- Ruby 3.4
- Node.js 22
- Docker (for PostgreSQL)

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

The dev server proxies `/api` requests to `http://localhost:3000`.

See [`gallery-app/README.md`](gallery-app/README.md) for full details.
