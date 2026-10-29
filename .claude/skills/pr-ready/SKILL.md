---
name: pr-ready
description: Final steps before a pull request in this repo, shared by the feature, bug-fix, config-change and existing-behaviour workflows: run the full checks, feed the reviewer agent with bin/review-inputs, act on its findings, and draft the PR body from the template. Use when a branch is done and the user asks to get it ready for a PR, review it, or open the PR, or types /pr-ready.
---

# PR ready

## Steps

1. **Full checks** for every area the branch changed, from the `CLAUDE.md` table: the commands
   and their output. Areas no check covers (`contract/`, `bin/`, `.claude/`, `.github/`): run
   what exists by hand and say what ran. Infra: ask the owner for `! ./test-install.sh`.
2. **Reviewer inputs:** run `bin/review-inputs`. It prints the path of
   `tmp/review-inputs-<branch>.txt`.
3. **Run the `reviewer` agent** with: that path, the plan path, and the workflow skill the branch
   followed (`feature`, `bug-fix`, `config-change` or `existing-behaviour`).
   - Agent definitions load at session start. If this branch changed
     `.claude/agents/reviewer.md`, the run must be in a fresh session: give the owner the prompt
     to paste there instead.
4. **For each finding**, one of:
   - fix it in a new commit, then rerun the checks from step 1;
   - prove it is not a problem, by hand, with the output;
   - leave it for the owner, with the reason.
   Never edit a test to satisfy a finding without saying so. A clean review is not proof: the
   reviewer catches part of what is wrong, and the owner decides.
5. **Draft the PR body** in `tmp/pr-body-<branch>.md`, from `.github/pull_request_template.md`:
   - **Workflow:** the skill followed;
   - **The change:** what and why, naming the plan and its slice;
   - **Verified:** the commands and their output; per criterion the red and green output, or
     the break table, or the revert-the-fix proof;
   - the reviewer's findings and what was done about each;
   - **Scope:** files outside the plan's areas, deleted files and removed dependencies first, or
     "none";
   - leave **Review notes** empty: the owner writes it.
6. **Stop and ask** before pushing or opening the PR, unless the request already said to.
7. **Record the results** where the plan says (its slice section, a results file) in the docs
   folder (path in `CLAUDE.local.md`, or ask). Edit it; never commit there.

## Do not

- Open or push the PR without being asked.
- Say the checks pass without showing their output.
- Summarise the reviewer's findings away: list each one and what happened to it.
