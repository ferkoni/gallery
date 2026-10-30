---
name: config-change
description: Workflow for a configuration change in this repo, to a PR-ready branch, where tests rarely cover the change and the Stop hook does not run for most of it. Use for changes to nginx, docker-compose, Dockerfiles, install.sh, env files, CI workflows, .claude/ settings, Gemfile or package.json, routes or initializers, or when the user types /config-change. If the change needs app code too, use feature or bug-fix instead.
---

# Config change

`CLAUDE.md` has the rules. This is the order to apply them in.

## Steps

1. **Write the change down**, even as one paragraph: the goal, the files expected to change, and
   what is out of scope. In the plan or issue if there is one, or in the PR description. The
   reviewer needs it to tell what is outside the plan.
2. **Branch** from an up-to-date `main`, named after the doc it implements.
3. **Edit.**
   - **Protected files** are exactly the `Edit(...)` ask rules in `.claude/settings.json`; read
     them there, since a list here goes stale. Only those paths prompt (not all of `.claude/`).
     Each edit asks the owner. Make all edits to one file as a single edit.
   - Other config: no prompt. New gems or packages are listed in the PR.
4. **Run the check for each changed area by hand.** The Stop hook only covers `gallery-api/`,
   `gallery-app/` and `sidecar/`.

   | Changed | Check |
   |---|---|
   | nginx, compose files, Dockerfiles, `install.sh`, `setup.sh` | Ask the owner to run `! ./test-install.sh`, then read the output. **Never run it yourself.** Not done until a green run has been seen |
   | API config, `Gemfile`, initializers, routes | `cd gallery-api && bin/ci` |
   | `package.json` | `cd gallery-app && npm run lint && npx tsc -b && npx vitest run` |
   | `sidecar/requirements*.txt` | `cd sidecar && .venv/bin/pytest -q` |
   | `.github/workflows/**` | Nothing local. The PR's own CI run is the test |
   | `bin/` | Its test script, if it has one (`bin/test-*`) |

5. **Prove it.** Find the check that would go red if the change were wrong, and show it red and
   then green. For an upload limit: a file just above the new limit fails, one just below passes.
   For infra, set it up and ask the owner to run it. If no check can go red for this change, say
   so in the PR: that is a gap, not a pass.
6. **Done** when every changed area has its check output. Then follow the `pr-ready` skill.

## Stop and ask

- The change needs app code (a setting the app must read, a new route with a controller): it is
  a feature or a bug fix.
- An infra change is ready: ask for `! ./test-install.sh`.
- A dependency would be removed or a check turned off.

## Do not

- Run `./test-install.sh` in any form.
- Skip a check because "it is only config".
