# Gallery

Monorepo with a React/Vite/TypeScript frontend (`gallery-app/`) and a Rails 8.1 API (`gallery-api/`) using Devise + devise-jwt for JWT authentication and PostgreSQL.

## Architecture

- `gallery-app/` — React 19, Vite, TypeScript. State: TanStack Query (server state) + Zustand (client state). Forms: React Hook Form.
- `gallery-api/` — Rails 8.1 API, Devise + devise-jwt, rack-cors, jsonapi-serializer, PostgreSQL.

Auth flow: `POST /api/users/login` returns a JWT token. Frontend stores it in memory and sends it as `Authorization: Bearer <token>` on subsequent requests.

