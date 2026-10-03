# Release and handoff

Read this before a preview deploy, push, merge, or production check.

Work on a feature branch in its own linked worktree. Run the appropriate focused
checks, push the branch, open a PR (draft is fine), and confirm its `verified` CI
check passes for the proposed merge. CI runs on PR revisions and pushes to `main`;
a branch without a PR needs a manual dispatch. A full local `npm run gate` remains
appropriate for testing-infrastructure changes or unresolved cross-suite concerns,
but is not a second mandatory gate for every PR. Passing evidence remains valid
for unchanged relevant content; rerun only what subsequent changes or failures affect.

Use the Git integration's preview or deploy with `npx vercel deploy`. Confirm the
preview corresponds to the tested commit, check the affected behavior and give Matt
its URL. Merge only with his explicit approval for that change. Approval already
given in the conversation counts; do not ask again unless the scope materially
changes. Prepare the branch, checks and preview before requesting approval. Never
push feature work to `main`.

After an approved merge, confirm that the production deployment contains the merged
commit and run `node dev/prod-check.mjs`. Record unfinished work, verification evidence
and pending approval in the task or an agreed handoff location.

`AGENTS.md` is the canonical guide; `CLAUDE.md` only points to it. Optional private
instructions belong in `AGENTS.local.md`, not in a second operational manual.
