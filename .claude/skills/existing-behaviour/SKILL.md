---
name: existing-behaviour
description: Workflow for adding tests, and no production code, for behaviour that already works in this repo, such as the contract suite's golden snapshots, tests for gaps a mutation run found, or tests pinning behaviour before a port or refactor. Each test is proven by a deliberate break instead of a red commit. Use when the work adds only tests or snapshots, or when the user types /existing-behaviour. If any production code must change, use feature or bug-fix.
---

# Tests for existing behaviour

The test passes the first time it runs, so there is no red commit. A deliberate break in the
code under test proves it instead.

## Steps

1. **Check this applies.** The work adds tests or snapshots only, and the behaviour already
   works. At the end, `git diff --name-only main...` must list only test and snapshot files. If
   production code has to change, stop: use `feature` or `bug-fix`.
2. **The plan** (docs folder path in `CLAUDE.local.md`, or ask) must list the behaviours, where
   the truth comes from for each (the code, its existing spec, the design doc), concrete
   examples, and the **known quirks**: each one either frozen as the contract or reported as a
   bug. If not, stop and ask.
3. **Branch** from an up-to-date `main`, named after the plan.
4. **Per behaviour:** read its existing spec first, write the test, run it against the current
   code. Expect green. If red:
   - the test is wrong (a typo, a fixture): fix it and say so;
   - the code does not do what the plan says: **stop and ask**. Never change the expected value
     to match the code without saying so.
5. **Deliberate break.** In the code under test, not in the test: a change a wrong
   implementation could plausibly make, taken from the plan's examples (403 instead of 404, a
   dropped filter). Uncommitted. Run the test: red **on its assertion**. Revert with
   `git checkout -- <file>`, run: green, and `git status` clean for that file. Record the break,
   the file and the result in a table. If no single break turns a test red, say why.
   For the contract suite, the break is in Rails and needs a server restart: at least one per
   test file, on what is most likely to regress in the port (ownership, status codes, order).
6. **Commit** tests per behaviour group, tests only; the message lists the breaks. Snapshots go in
   a **separate commit**, written by the record command, never by hand. After it, any snapshot
   change is a test edit.
7. **Snapshots:**
   - record only from the known-good system (Rails, never Node);
   - read every snapshot before committing: no 429, 302, HTML body, real bucket name, or an id or
     time that was not pinned;
   - record, then run twice with no diff; a diff means something is not pinned;
   - **never re-record to make a failing run pass**: a mismatch is a finding, and re-recording is
     the owner's decision, in its own commit with the reason;
   - a missing snapshot must fail in CI, not be written: check it with a deleted snapshot.
8. **Areas the Stop hook does not cover** (`contract/` today): run the suite by hand and show the
   output. If the area has no row in the `CLAUDE.md` checks table, say so and ask.
9. **Done** when every behaviour has a test, a break and its red and green output. Then follow
   the `pr-ready` skill, with the break table in Verified.

## Stop and ask

- Production code needs to change.
- The code disagrees with the plan, or a quirk is not on the plan's list.
- No break can turn a test red.
- A snapshot changes between runs.

## Do not

- Leave a deliberate break in the code.
- Re-record snapshots to make a run pass, or edit them by hand.
- Change the code under test to make it easier to test.
