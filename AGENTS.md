# Tools agent guide

Tools for product work, energy and exploring uncertain situations. The consolidation plan and delivery evidence live in `CONSOLIDATION.md`. Each does one job
exceptionally well: no accounts, no tracking, and static browser code without a
build step. Shareable models belong in the URL; local persistence and Gauge’s
ephemeral relay have explicit boundaries in `ARCHITECTURE.md`. This guide adds repository constraints to the user-level
working standards.

## First principles

- Work only on a feature branch in a linked worktree. Never make feature changes or
  push from `main`. Prepare a tested preview before seeking merge approval; Matt's
  explicit approval for the change already given in the conversation counts.
- Keep employer/private material out of shipped copy, examples, commits and external
  services. Use fictional or generic examples.
- Keep parsing, computation and artefact rendering pure; browser modules own DOM
  and storage effects. For text-driven tools, source edits are undoable and flow
  through parse → project → render. UI-driven tools retain their own state model.
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
npm run test:changed
npm run gate
npm run gate:serial
npm run worktree -- create <name>
```

`npm run test:changed` is the usual local check; PR CI is the authoritative
pre-merge verification. `npm run gate` retains full local coverage. Selection and
execution live in `dev/test-plan.mjs` and `dev/pw/run.mjs`; do not duplicate their
mutable inventories here. A parallel red needs the failed suite re-run serially before it is classified.

## Route by the work you are doing

| Work | Read before changing it | Evidence |
|---|---|---|
| Tool semantics, parser, or engine | that tool's `CONTEXT.md` when present; `ARCHITECTURE.md` | focused Node tests; golden verification when output changes |
| Visual or interaction work | `docs/agent/VISUAL.md` | inspected desktop and phone renders in both themes |
| Tests or Playwright harness | `docs/agent/TESTING.md` | focused passing result; regression tests detect the bug |
| New tool | `docs/agent/NEW_TOOL.md` | approved design/spec before implementation |
| Preview, CI, or merge | `docs/agent/RELEASE.md` | focused checks, preview, branch CI, then approval |

Use `dev/tool-dirs.mjs` and `lab/dist/shared/catalog.js` for tool inventories,
`dev/suite-pages.mjs` for shared pages, `dev/origins.mjs` for origin routing,
and `dev/pw/package.json` for the browser-suite chain. These are sources of truth,
not prose to copy.
