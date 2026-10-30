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
   - **Workflow** section: the skill followed; if commits followed different workflows, name
     each with its commits;
   - **The change:** what and why, naming the plan and its slice;
   - **Verified:** the commands and their output; per criterion the red and green output, or
     the break table, or the revert-the-fix proof;
     then, still under Verified, each reviewer finding and what was done about it;
   - **Scope:** files outside the plan's areas, deleted files and removed dependencies first, or
     "none";
   - **Changes after review:** "none" until the owner reviews (step 8).
6. **Stop and ask** before pushing or opening the PR, unless the request already said to.
7. **Record the results** where the plan says (its slice section, a results file) in the docs
   folder (path in `CLAUDE.local.md`, or ask), and add the PR's row to
   `agent-guardrails/reviewer-log.md` there: findings fixed / no change / left for the owner,
   and the reviewer's tokens from its task notification (or "not recorded"). Edit; never commit
   there.
8. **Owner's review.** The owner reads the diff and raises points in the session.
   - Each change asked for follows the branch's workflow: a behaviour change gets its red and
     green commits (or the revert-the-fix proof), anything else its check. Then step 1 again.
   - Re-run the reviewer (steps 2 and 3) if a change touches behaviour or a protected file
     (the `Edit(...)` ask rules in `.claude/settings.json`).
   - Add each change to **Changes after review**: what changed; the owner's reason, quoted when
     it was a sentence or two, paraphrased and marked "paraphrased" only after a longer
     discussion; the commit; "reviewed", or "not re-reviewed" and why.
   - Each point that ended with no change: "Raised: X. Kept, because Y."
   - Update the PR's row in `reviewer-log.md`: the changes after review, and as **missed** or
     **wrong** only what the owner names as such.
   - If the PR is open, push and update its body with
     `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@tmp/pr-body-<branch>.md`
     (`gh pr edit` fails on GitHub's Projects classic deprecation), then check the body changed.

## Do not

- Open or push the PR without being asked.
- Say the checks pass without showing their output.
- Summarise the reviewer's findings away: list each one and what happened to it.
