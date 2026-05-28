# gallery-app

React frontend for the Gallery application — a photo management app with album organisation, image uploads, and S3 storage integration.

## Tech stack

- **React 19** with React Compiler enabled
- **Vite 8** + TypeScript
- **TanStack Query** — server state management
- **Zustand** — client state (upload queue)
- **React Hook Form** + **Zod** — forms and validation
- **React Router v7** — routing
- **Tailwind CSS v4** — styling
- **Axios** — HTTP client
- **Vitest** + Testing Library — unit/integration tests

## Project structure

```
src/
  features/
    auth/          # Login form, AuthProvider, JWT token hooks
    albums/        # Album list, create, edit
    images/        # Image grid, upload, lightbox, edit
    settings/      # S3 credentials management
    pages/         # Top-level pages (LoginPage, WelcomePage)
  components/      # Shared UI (NavBar, Pagination, ErrorBoundary, ProtectedRoute)
  hooks/           # Shared hooks (usePagination, useOnClickOutside)
  lib/
    api/           # Axios client, CRUD factory, token store
```

## Authentication

Login via `POST /api/users/login`. The JWT token is stored in memory (`tokenStore`) and sent as `Authorization: Bearer <token>` on every request. Protected routes redirect to `/login` when no token is present.

## Getting started

```bash
npm install
npm run dev        # start dev server
npm run build      # production build
npm run test       # run tests with coverage
npm run lint       # lint
```

The dev server runs on `http://localhost:5173` by default and proxies API requests to the Rails backend at `http://localhost:3000`.
