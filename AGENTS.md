# Tools agent guide

Small, sharp tools for product work under uncertainty. Each does one job
exceptionally well: no accounts, no tracking, no runtime dependency or build step;
state belongs in the URL. This guide adds repository constraints to the user-level
working standards.

## First principles

- Work only on a feature branch in a linked worktree. Never make feature changes or
  push from `main`; preview deploys need Matt's approval before merge.
- Keep employer/private material out of shipped copy, examples, commits and external
  services. Use fictional or generic examples.
- Text is the model. Preserve the parse → project → render → app boundary; rendered
  interactions must dispatch undoable text edits rather than mutate DOM state.
- Add or update a tool `CONTEXT.md` only when a plausible semantic misreading would
  survive ordinary reading of its parser, UI, and tests. Record meaning, boundaries,
  and handoffs—not file inventories, commands, or change history.
- Keep stable concepts in `ARCHITECTURE.md` and `DSL.md`; mutable inventories,
  routes, and gate behaviour belong in their executable sources.

If `AGENTS.local.md` exists, read it after this file. It is an optional private
overlay and is intentionally not versioned.

## Canonical commands

Run commands from the repository root:

```bash
npm run test:node
npm run gate
npm run gate:serial
npm run worktree -- create <name>
```

`npm run gate` is the pre-merge gate. Its executable implementation, including
current suite list and parallelism, is `dev/pw/run.mjs`; do not duplicate those facts
here. A parallel red needs the failed suite re-run serially before it is classified.

## Route by the work you are doing

| Work | Read before changing it | Evidence |
|---|---|---|
| Tool semantics, parser, or engine | that tool's `CONTEXT.md` when present; `ARCHITECTURE.md` | focused Node tests; golden verification when output changes |
| Visual or interaction work | `docs/agent/VISUAL.md` | inspected desktop and phone renders in both themes |
| Tests or Playwright harness | `docs/agent/TESTING.md` | predicted failure and focused passing result |
| New tool | `docs/agent/NEW_TOOL.md` | approved design/spec before implementation |
| Preview, CI, or merge | `docs/agent/RELEASE.md` | gate, preview, branch CI, then approval |

Use `dev/tool-dirs.mjs` for tool inventory, `dev/origins.mjs` for origin routing,
and `dev/pw/package.json` for the browser-suite chain. These are sources of truth,
not prose to copy.
