# Gallery

Monorepo with a React/Vite/TypeScript frontend (`gallery-app/`) and a Rails 8.1 API (`gallery-api/`) using Devise + devise-jwt for JWT authentication and PostgreSQL.

## Architecture

- `gallery-app/` — React 19, Vite, TypeScript. State: TanStack Query (server state) + Zustand (client state). Forms: React Hook Form.
- `gallery-api/` — Rails 8.1 API, Devise + devise-jwt, rack-cors, jsonapi-serializer, PostgreSQL.

Auth flow: `POST /api/v1/users/login` returns a JWT token. Frontend stores it in `sessionStorage` and sends it as `Authorization: Bearer <token>` on subsequent requests.

## Workflows

Start work with the skill for its kind: `/feature`, `/bug-fix`, `/config-change`, or `/existing-behaviour` (tests only, for behaviour that already works). Finish with `/pr-ready`. The skills have the steps; this file has the rules.

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
- A new test is shown failing on an assertion about the behaviour before it is trusted, not on a load error, missing constant, missing route or syntax error. For something that does not exist yet, commit an empty stub on its own first.
- TDD, when adding or changing behaviour: two commits per cycle. A red commit with only the new test, failing, then a green commit with the code. Tests only, for behaviour that already exists: no red commit; prove each test with a deliberate break instead (`/existing-behaviour`).
- If a failing test is wrong, or cannot pass without editing it or special-casing, stop and say so. Do not edit the test, hard-code expected values or override equality.
- If finishing the task needs a change outside its scope (removing a dependency, deleting a file, changing existing behavior or config), stop and ask. Do not do it as a side step.
- A recommendation that goes into a plan or decides something: give the options, the criteria from the plan's goal (for guardrail work, first: does this open a way around a check?), the strongest argument against your pick, and what would change your mind. Label a quick lean "leaning X, not analysed".
