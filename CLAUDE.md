# Gallery

Monorepo with a React/Vite/TypeScript frontend (`gallery-app/`) and a Rails 8.1 API (`gallery-api/`) using Devise + devise-jwt for JWT authentication and PostgreSQL.

## Architecture

- `gallery-app/` — React 19, Vite, TypeScript. State: TanStack Query (server state) + Zustand (client state). Forms: React Hook Form.
- `gallery-api/` — Rails 8.1 API, Devise + devise-jwt, rack-cors, jsonapi-serializer, PostgreSQL.

Auth flow: `POST /api/v1/users/login` returns a JWT token. Frontend stores it in `sessionStorage` and sends it as `Authorization: Bearer <token>` on subsequent requests.

## How to check your work

Run the checks for every area you changed.

| Area | Fast | Full |
|---|---|---|
| API (`gallery-api/`) | `cd gallery-api && bundle exec rspec` | `cd gallery-api && bin/ci` |
| App (`gallery-app/`) | `cd gallery-app && npm run lint && npx tsc -b && npx vitest run` | same |
| Sidecar (`sidecar/`) | `cd sidecar && .venv/bin/pytest -q` | same |
| Infra (nginx, compose files, Dockerfiles) | `./test-install.sh`, run by the user only | |

- API specs need PostgreSQL. If they fail with "Connection refused" on port 5432, start it with `cd gallery-api && docker compose up -d`.
- Sidecar: plain `pytest` is not installed globally; use the sidecar's `.venv`.
- Infra: never run `./test-install.sh` yourself. When an infra change is ready, ask the user to run `! ./test-install.sh`, then read the output.

## Definition of done

Show the command you ran and its output. Do not say tests pass without that. An infra change is not done until you have seen a green `./test-install.sh` run.

## Rules

- Do not weaken or delete an assertion to make a test pass.
- Do not add a `rescue` or `catch` that hides an error.
- Do not mock our own classes; mock only external services.
- TDD: two commits per cycle. A red commit with only the new test, failing, then a green commit with the code. The red test must fail on an assertion about the behaviour, not on a load error, missing constant, missing route or syntax error.
- If a failing test is wrong, or cannot pass without editing it or special-casing, stop and say so. Do not edit the test, hard-code expected values or override equality.
- If finishing the task needs a change outside its scope (removing a dependency, deleting a file, changing existing behavior or config), stop and ask. Do not do it as a side step.

