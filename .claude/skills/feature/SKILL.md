---
name: feature
description: Workflow for building a feature or changing behaviour in this repo, test first, from the plan to a PR-ready branch. Use when starting work from a feature plan or a slice of one, or when the user types /feature. Not for fixing a bug (bug-fix), a config-only change (config-change), or adding tests for behaviour that already works (existing-behaviour).
---

# Feature

`CLAUDE.md` has the rules. This is the order to apply them in. The reasons are in the docs folder,
`agent-guardrails/04-workflow-feature.md`.

## Steps

1. **Find the plan.** The docs folder path is in `CLAUDE.local.md`; if it is not there, ask.
   The plan must have scope in and out, the files each PR is expected to touch, and acceptance
   criteria with concrete examples (exact input, expected output). If any is missing, stop and
   ask. Do not invent them.
2. **Branch** from an up-to-date `main`: `git fetch origin main:main`, then
   `git switch -c <name> main`. Name it after the plan: `ai-feature-<doc-stem>`,
   `guardrails-NN-<slug>` or `rails-to-node-NN-<slug>`. Exit: `git log main..` is empty.
3. **One behaviour at a time**, using the plan's example values in the tests:
   - **Something that does not exist yet** (a script, an endpoint, a class): first commit an
     empty stub on its own, an executable that prints nothing or a route with an empty action.
   - **Red commit:** only the new test. Run it and show the output. It must fail on an assertion
     about the behaviour, not on a load error, a missing constant or route, or a syntax error.
   - **The feature's riskiest rule** (ownership, access control, whatever the plan marks as
     most important): the red test is written by a subagent that gets only the plan path, the
     criterion and its example, and where the test goes. Not the code, not this session's
     reasoning. Read its test, run it red, commit it as the red commit.
   - **Green commit:** the smallest code that passes. Do not touch the test. If the test looks
     wrong, stop and say so.
   - Returning a constant is fine inside a cycle, but the next example must force the general
     code. No branch on a literal test value may be left at the end.
   - A rule that must always hold ("never another user's photo"): consider a property test.
4. **Side steps.** Anything outside the plan's scope (deleting a file, removing a dependency,
   changing existing behaviour or config): stop and ask. If the owner agrees, update the plan's
   scope in the docs folder. Never commit in the docs folder.
5. **Protected files** (the `Edit(...)` ask rules in `.claude/settings.json`): before the edit,
   say why the feature needs it. Make all edits to one file as a single edit, so there is one
   prompt to read.
6. **Done** when, for each criterion, you can show one red output and the matching green output,
   and the full checks for every changed area (`CLAUDE.md` table) pass with output shown. Then
   follow the `pr-ready` skill.

## Stop and ask

- The plan lacks scope, files or examples.
- A red test cannot be made to fail on an assertion.
- A test looks wrong, or cannot pass without editing it or special-casing.
- The Stop hook sends you back twice for the same failure.
- A side step or a protected file the plan does not name.

## Do not

- Change a test in a green or refactor commit.
- Add a `rescue` or `catch` that hides an error, or mock our own classes.
- Add tests "for coverage" beyond the plan's behaviours; more tests did not change outcomes in
  the research, only cost.
