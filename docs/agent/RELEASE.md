# Release and handoff

Read this before a preview deploy, push, merge, or production check.

Work on a feature branch in its own linked worktree. Before merge, run `npm run gate`,
push the branch, open a PR (draft is fine), and confirm that its verification workflow
passes for the committed result. Automatic CI runs on PR revisions and pushes to
`main`; a feature branch without a PR needs a manual workflow dispatch. A passing gate remains valid for unchanged content; rerun relevant checks
when subsequent changes, failures or unresolved concerns require it.

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
