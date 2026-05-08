# Gallery API

Rails 8.1 API-only backend for the Gallery application.

## Requirements

- Ruby 3.2.0
- Docker and Docker Compose

## Development Setup

### 1. Install dependencies

```bash
bundle install
```

### 2. Configure environment variables

Copy the example env file and adjust values if needed:

```bash
cp .env.example .env
```

The following variables are available in `.env`:

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_USER` | PostgreSQL username | `gallery_api` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `gallery_api_password` |
| `POSTGRES_DB` | Development database name | `gallery_api_development` |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |

### 3. Start the database

```bash
docker compose up -d
```

### 4. Create and migrate the database

```bash
rails db:create db:migrate
```

### 5. Start the server

```bash
rails server
```

The API will be available at `http://localhost:3000`. You can verify it is running with:

```bash
curl http://localhost:3000/health
```

## Running Tests

```bash
rails test
```

## Stopping the database

```bash
docker compose down
```

To also remove the stored data:

```bash
docker compose down -v
```
