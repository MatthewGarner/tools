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

Start with the focused test. Run `npm run test:node` for changed pure modules, and
run `npm run gate` before merge. Do not weaken assertions or retry a failure to make
a flake disappear; reproduce a parallel failure serially and classify the cause.
Once appropriate checks pass, broaden or repeat them only for new changes, failures
or unresolved concerns. Documentation-only edits normally need the existing
documentation checks during development; the full pre-merge gate still applies.

## Editorial interfaces

Editorial live views deliberately keep unneeded controls quiet at rest. Exercise the
visible menu or named return route, not a hidden empty field. Identify wrapped SVG
content by authored semantic data rather than its visual line breaks, and assert each
phone view's own reading purpose instead of expecting a desktop fallback. Motion
checks must likewise exclude controls intentionally dormant until hover or focus.
