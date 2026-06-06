# gallery-app

React/TypeScript frontend for [Gallery](https://github.com/ferkoni/gallery-api) — a self-hostable photo management app with album organisation, image uploads, S3 storage, and async album downloads.

**Sister repo:** [gallery-api](https://github.com/ferkoni/gallery-api) — Rails 8.1 API backend.

---

## Features

- Browse albums and images with pagination
- Upload images with per-file progress tracking
- Lightbox viewer with keyboard navigation
- Filter images by album, favourites, or full-text search
- Edit metadata: title, description, tags, album
- Async album download — triggers a background job, notified via WebSocket when the zip is ready
- S3 credentials management
- Fully protected routes — unauthenticated requests redirect to login

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 19 + React Compiler |
| Build | Vite + TypeScript |
| Server state | TanStack Query |
| Client state | Zustand |
| Forms | React Hook Form + Zod |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| HTTP | Axios |
| Tests | Vitest + Testing Library |

---

## Project structure

```
src/
  features/
    auth/        # Login form, AuthProvider, JWT token hooks
    albums/      # Album list, create, edit
    images/      # Image grid, upload, lightbox, edit, search
    downloads/   # Async album download flow, WebSocket listener
    settings/    # S3 credentials form
    pages/       # Top-level pages (LoginPage, WelcomePage)
  components/    # Shared UI (NavBar, Pagination, ErrorBoundary, ProtectedRoute)
  hooks/         # Shared hooks (usePagination, useOnClickOutside)
  lib/
    api/         # Axios client, CRUD factory, token store
```

---

## Key design decisions

**TanStack Query for server state, Zustand only for upload queue.** Server-fetched data (albums, images) lives exclusively in TanStack Query's cache. Zustand manages the upload queue — a client-side concern with no server equivalent (progress, per-file status). Mixing them would couple cache invalidation logic to local UI state.

**CRUD factory.** `createCrudApi` and `createCrudHooks` generate typed `fetchAll`, `fetchPaginated`, `fetchOne`, `create`, `update`, and `destroy` methods from a single path string. New resources require no boilerplate beyond the type definition.

**JWT stored in memory, never in localStorage.** The token lives in a module-level variable (`tokenStore`). It is sent as `Authorization: Bearer <token>` on every request via an Axios request interceptor. A 401 response clears the token and redirects to `/login`. This eliminates XSS token theft at the cost of requiring re-login after a page reload — an intentional trade-off for a self-hosted app.

**React Compiler enabled.** Automatic memoisation is handled by the compiler, so the codebase contains no manual `useMemo` or `useCallback` calls. Components are written as plain functions.

**Async download with WebSocket notification.** Requesting an album download enqueues a background job on the API. The frontend opens an ActionCable channel and listens for a completion (or failure) broadcast. When the URL arrives, a toast notification lets the user download the zip — no polling.

---

## Auth flow

```
POST /api/users/login
  → JWT token returned in response body
  → stored in memory (tokenStore)
  → attached to every request via Axios interceptor

401 response
  → token cleared
  → redirect to /login

Logout
  → DELETE /api/users/logout
  → token cleared locally
  → JTI rotated server-side (token immediately invalid)
```

---

## Testing

```bash
npm run test       # run tests with coverage
```

Tests are written with Vitest + Testing Library. Coverage is enforced at **100% per file** (statements, branches, functions, lines) — the suite fails if any file drops below. Covered areas:

- Auth flow: `AuthProvider`, `LoginForm`, `useAuth` — token storage, 401 redirect, logout
- Upload pipeline: `useUpload`, `uploadStore`, `UploadQueue` — per-file progress, error states, queue management
- Async download: `useDownloadAlbum`, `useUserChannel`, `useTaskPoller`, `DownloadToast` — WS connection lifecycle, fallback polling, toast notifications
- API layer: `imagesApi`, Axios client — request construction, 401 interception, mock adapter
- Shared components: `Pagination`, `NavBar`, `Lightbox`, `ImageGrid`, `ImageCard`

---

## Deployment

The `Dockerfile` produces a static build served by nginx:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  -t gallery-app .
docker run -p 80:80 gallery-app
```

`VITE_API_URL` defaults to `/api` (same-origin reverse proxy). For cross-origin deployments, set it to the full API URL at build time.

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` requests to `http://localhost:3000` (the Rails backend).

```bash
npm run build      # production build → dist/
npm run test       # run tests with coverage
npm run lint       # ESLint
```
