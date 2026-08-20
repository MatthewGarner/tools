# New-tool route

Read the current roadmap before proposing a new tool. A candidate earns its place by
intrinsic utility and a sharp, evidenced need—not by filling a topic slot.

Obtain design approval, write the local spec and plan, then implement through the
existing parse → project → render → app spine. New tools need a clear verdict, both
themes, a narrow re-layout, source-based exports, PWA registration, and the relevant
Node and browser coverage. Add shared code only when a third real consumer justifies
it; do not extract thinly-tested code for tidiness alone.

Use `dev/tool-dirs.mjs` for registration, `dev/origins.mjs` for origin decisions,
and the existing test suites as the completion checklist. Treat product examples as
fictional or generic.
