---
name: bug-fix
description: Workflow for fixing a bug in this repo, from the bug entry to a PR-ready branch: reproduce it with a failing test, make the smallest fix, then prove the test by reverting the fix. Use when the user asks to fix a bug, names an entry in bugs.md, reports something broken, or types /bug-fix. Not for new behaviour (feature) or config-only changes (config-change).
---

# Bug fix

`CLAUDE.md` has the rules. This is the order to apply them in. The reasons are in the docs folder,
`agent-guardrails/05-workflow-bug-fix.md`.

## Steps

1. **The bug entry is the plan.** Usually an entry in `bugs.md` in the docs folder (path in
   `CLAUDE.local.md`, or ask), or a bug folder with its own plan. It must say what is wrong,
   where, and the fix. If it has no fix written, ask for one before starting.
2. **Branch** from an up-to-date `main` (`git fetch origin`, then
   `git switch -c <name> --no-track origin/main`), named after the entry. Exit:
   `git log origin/main..` is empty.
3. **Reproduce.** Write a test that shows the bug, and run it on the current code. It must fail
   on its assertion (the wrong result), not on a load error or a missing component. Show the
   output. Commit it alone: this is the red commit.
   - Green before the fix means the test does not catch the bug. Stop and rethink the test.
4. **Fix.** The smallest change that turns the test green. Do not touch the test. Commit: the
   green commit.
5. **Prove the test.** With the test kept, revert only the fix and run the test: red. Restore the
   fix and run it: green. Use the red commit's SHA, not `HEAD~1`, which is wrong once any commit
   follows the fix: `git checkout <red-sha> -- <fixed files>`, run, then
   `git checkout HEAD -- <fixed files>`, run, and `git status` is clean. Show both outputs; they
   go in the PR.
6. **Other problems seen on the way:** report them, do not fix them. The owner adds them to
   `bugs.md` or `unbuilt-work.md`.
7. **Done** when steps 3 and 5 have their outputs and the full checks for every changed area
   (`CLAUDE.md` table) pass with output shown. Then follow the `pr-ready` skill.
8. **After the PR merges:** delete the entry from `bugs.md` and note the PR under **Fixed**, as
   the file says. Bug numbers are never reused. Edit the docs folder; never commit there.

## Stop and ask

- The entry has no fix, or the fix turns out to be wrong.
- The reproducing test is green on the current code.
- The fix needs a change outside the entry (a deleted file, a removed dependency, other
  behaviour).

## Do not

- Hide the symptom: a `rescue` or `catch` that swallows the error, an `if` on the test's input,
  a loosened assertion.
- Clean up nearby code "while there".
- Change the new test after its red commit.
