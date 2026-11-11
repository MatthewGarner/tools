# New-tool route

Use the user's stated need and any roadmap or product brief supplied in the task.
There is no required roadmap file in a clean checkout. If an unresolved product
choice would change the proposal, ask a focused question while continuing any
independent work. A candidate earns its place through intrinsic utility and an
evidenced need.

Prepare a concrete design for approval before implementation. Approval already given
for that design in the conversation counts. Record the agreed scope and plan in the
task or a supplied handoff location; no private document is required to begin.

Follow the pure-core / browser-shell boundary in `ARCHITECTURE.md`, choosing text or
UI input to fit the tool. New tools need a clear reading outcome, both themes, a
narrow re-layout, appropriate source-based exports, PWA registration, and relevant
Node and browser coverage. Apply the shared-code policy in `ARCHITECTURE.md`: three
real consumers normally justify extraction; two may justify it to avoid depending
on a sibling's private implementation. Do not refactor thinly-tested code for
tidiness alone.

Use `dev/tool-dirs.mjs` for registration, `dev/origins.mjs` for origin decisions,
and the existing test suites as the completion checklist. Treat product examples as
fictional or generic.

Start with `node dev/new-tool.mjs <id> <title>` for the shared full-app/article
scaffold. Every registered tool must own a bounded definition and useful default
article view; the catalogue gate enforces this. Follow [embed/README.md](../../embed/README.md)
for model isolation, preview, immutable release, and article generation. Remove the
starter's draft marker only after replacing its example semantics and completing
native registration and checks.

Page header and saving (a checklist; the shell tests fail a page that skips a step):

1. Register the tool: `TOOL_DIRS` and `INSTRUMENTS` (its number) in `dev/tool-dirs.mjs` (Energy: `ENERGY_TOOL_DIRS` and `ENERGY_INSTRUMENTS`), the page in `SUITE_PAGES` (`dev/suite-pages.mjs`), and the catalogue entry. Do this before `npm run sync`, which refuses an unregistered page.
2. Add the tool to `RECENT_TOOLS` in `assets/recent-store.js` (its scope: `tools` or `energy`). Without it the File menu stays disabled and says the page did not finish loading.
3. Page markup: the shared stylesheet links, `<div class="wrap"><header data-tool-header><p class="kicker" id="kicker"></p></header></div>`, then `<main id="main" tabindex="-1">`. The h1 and File menu are stamped, not written. Paint the kicker with `paintKicker($('kicker'), '<number>', '<epithet>')` (`assets/verdict.js`); `dev/kicker-index.test.mjs` checks number and epithet against the index.
4. Manifest entry in `dev/shell-manifest.mjs`: `name` equal to the catalogue title, `anchor`, and only the File items the page really has (`new`, `examples`, `templates`, `share`), plus `workspaces` (what Your work calls the page's own live records, e.g. Gauge's question sets), `ownLink` (a `#copylink` that copies something other than the model link) and `longName` (a title too long for a phone title row) only where they apply. Then `npm run sync`, and add the same flags to the literal table in `dev/shell-manifest.test.mjs`.
5. Hand-off: call `mountRecentSave({getState, getHash})` for Save a copy (and templates), `mountModelLink({getState})` for Share, and `provide({blank, examples: [{name, pick}], getHash})` (`assets/recent-ui.js`) for New, Examples and a link builder of your own. Share's default limit is 6000 characters; pass a larger one only if the model needs it. Page controls that are not File items go in one row at the top of `main`, inside a `.wrap`.
6. Add the page to the browser suites (`dev/test-plan.mjs`, a per-page table group in `dev/pw/tool-shell*.mjs`) and watch it pass `first-screen.mjs`.
7. A new Energy tool also means editing the E1-E5 strip (and its All energy tools item) on every Energy page.
