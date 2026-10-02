# Test integrity

Read this before adding or changing Node, browser, or meta-tests.

Test the observable contract. For a regression test, demonstrate that the relevant
bug makes the named assertion fail, then show the focused test passing with the fix.
Use an existing failing reproduction or a small, valid mutation when needed; syntax
errors and unrelated failures are not evidence. Routine fixture, naming or harness
maintenance does not require manufacturing a failure unless assertion sensitivity
is in question. Add tests when they protect meaningful behavior, not simply to
mirror a reversible, low-impact edit.

Wait for the state required by the next assertion, not a weaker early signal. If the
state has no honest predicate, keep a documented, bounded settle rather than adding a
generic retry. A negative assertion must first be shown true after the action that is
supposed to change it. Use a known-positive check before treating a tool's silence as
absence.

A bounded delay is valid only where elapsed time changes the asserted contract; name
that temporal dependency or configuration beside the delay.

Start with the focused test. `npm run test:changed` selects against the merge base
with the origin/main branch, including local staged, unstaged and untracked files. Use
`npm run test:changed -- --plan` to inspect the reasons without running anything.
For a quick browser loop, use `npm run test:browser -- --tool rank`; add
`--suites smoke.mjs` to investigate one suite. Explicit tool selection is focused
evidence, not a claim to have checked all effects of a change.

PR CI uses the same selection policy against the proposed merge. Owned tool edits
include consumers and complete registered handoffs; shared code, infrastructure,
deletions and uncertain scope select the full gate. Documentation has a narrow
path allowlist. Non-documentation changes retain all Node checks and goldens.
Main and manual CI runs always cover the complete catalogue. Selection lives in
`dev/test-plan.mjs`; suite membership still comes from the executable browser chain.

Use `npm run gate` for a full local diagnosis or testing-infrastructure changes.
A routine PR does not need a second full local run before its authoritative CI.
Never repeat passing checks on unchanged relevant content without a new concern.
Diagnose a parallel red using that suite with `--jobs 1`; do not retry until green
or weaken its assertion. Preserve genuine elapsed-time contracts when adjusting waits.

Each runner owns ephemeral origins and evidence directories; relay suites own
separate servers too. Never kill a server discovered by port. Logs and timings are
retained at the evidence path printed by the runner. Full browser runs retain their
assertion floors; focused runs must prove each selected tool reached scoped browser
assertions, not merely metadata checks.

Prefer pure-module tests for exhaustive logic cases and browser tests for actual
integration contracts. Targets are seconds for focused logic, under a minute for
ordinary tool journeys and 2–3 minutes for an ordinary PR; measure before claiming
an improvement. Keep broad timing cleanups separate from changes to selection.

## Editorial interfaces

Editorial live views deliberately keep unneeded controls quiet at rest. Exercise the
visible menu or named return route, not a hidden empty field. Identify wrapped SVG
content by authored semantic data rather than its visual line breaks, and assert each
phone view's own reading purpose instead of expecting a desktop fallback. Motion
checks must likewise exclude controls intentionally dormant until hover or focus.
