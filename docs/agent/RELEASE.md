# Release and handoff

Read this before a preview deploy, push, merge, or production check.

Work on a feature branch in its own linked worktree. Before merge, run `npm run gate`,
push the branch, and watch its verification workflow so a clean checkout validates
the committed result. Deploy a preview with `npx vercel deploy`; give Matt the preview
URL and wait for explicit approval before merging. Never push feature work to `main`.

If this repository still has an ignored historical instruction file in its primary
checkout, save any private additions in `AGENTS.local.md` before bringing in the
tracked entrypoint. Do not maintain a second operational manual in `CLAUDE.md`.

After an approved merge, confirm the production deployment and run `node
dev/prod-check.mjs`. Record unfinished or approval-gated work in the agreed durable
handoff, not in a second operational instruction file.
