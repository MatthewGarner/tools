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
