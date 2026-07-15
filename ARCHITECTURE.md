# How it's built

The tools in this repo are small, sharp, and share a spine. This document is the
spine — the properties that hold across every tool, and the reasons they're shaped
the way they are. It's deliberately not an inventory: the list of tools, the path
map between the two domains, and the browser suites all live in code that's checked
at test time (`dev/tool-dirs.mjs`, `dev/origins.mjs`, `dev/pw/package.json`), so
listing them again here would just be a second copy to drift. Where a fact is
enumerable, this points at the code that enumerates it.

## The shape of a tool

One folder per tool: an `index.html` plus a handful of ES modules, with node tests
beside it under `<tool>/tests/`. There's no build step and no runtime dependency — every
tool ships as static files, and state lives in the URL hash so any model is a
bookmarkable, shareable link.

Inside a tool the flow is always the same four beats:

- **parse** — text (a small DSL, or the URL state) becomes a plain data model.
- **project / engine** — pure functions turn that model into whatever the tool
  actually computes: a Monte-Carlo rollup, a merit-order stack, a layout.
- **render** — pure functions emit **SVG strings** from the projected model.
- **app** — the only part that touches the DOM: it wires the editor, the refresh
  loop, and the export buttons.

The leverage is that the first three beats are pure. Parsing, engines and renderers
are functions from data to data (or data to string), so they're fully testable in
node with no browser — which is why the test suites are as load-bearing as they are.
`app.js` owns the DOM and nothing else does.

## Text is the model

The rendered picture is never the source of truth; the text is. A tool parses text
into a model, projects it, and renders it. When you interact with the rendered
output — dragging a roadmap bar, editing a value in place — the interaction does
**not** mutate the DOM as if it were the model. It dispatches an ordinary, undoable
**text edit** to the editor (CodeMirror, vendored and pinned under `roadmap/vendor/`),
which flows back through the same parse-project-render loop. The result stays
URL-coherent and undoable, and there is exactly one source of truth.

Edit-in-place works by renderers marking targets with `data-edit` / `data-line` /
`data-raw` attributes; a shared handler (`assets/edit-in-place.js`) turns a click
into the right input/popover/cycle interaction; and each tool owns the pure, tested
function that rewrites its own text (`<tool>/edit-targets.js`). The rewrite is pure
and tested in node — the DOM is just the trigger.

The DSLs share conventions: soft, line-numbered warnings rather than hard errors
(a half-finished document still renders); `//` comments; `title:` / `palette:` /
`accent:` config keys; two-space indents; and a source-line reference on every
parsed node so a warning can point back at the line that caused it.

The full grammar of every DSL tool — config keys, node syntax, worked examples, and
which tool supports what — is collected in `DSL.md`, kept true to the parsers by a test
that parses every example through the real `parse.js`.

## Shared code

Anything used by three or more tools moves into `assets/` and gets imported rather
than re-implemented — design tokens, the SVG string helpers, the maths and
hash-state primitives, the app-shell plumbing, the editor factory, the export
wiring, the motion helpers. After every feature ships there's a shared-code pass:
anything now duplicated three times over is a candidate for extraction. The
counter-rule matters as much: don't rewrite thinly-tested code for zero user
benefit, and don't extract something only two tools use.

CodeMirror is the one vendored dependency — a committed, pinned bundle under
`roadmap/vendor/` (rebuild recipe alongside it). It is never fetched at runtime;
there is no npm dependency in anything that ships.

## Two origins, one repo

There are two public domains served from this one repository. The main tools serve
straight off the repo root; a second set of energy tools lives under `energy/` and
serves on a second domain via host-conditioned rewrites. The whole path map — which
URL maps to which file on which host — lives exactly once, in `dev/origins.mjs`, and
everything else (the production rewrites, the local dev server's emulation, the
service-worker precache lists) derives from it, with a test that fails on drift.

The trap worth writing down, because it shipped broken once: **Vercel serves the
filesystem before it applies rewrites.** So a rewrite can't shadow a file that
physically exists at that path. That's why each origin's root trio
(`index.html` / `sw.js` / `manifest.webmanifest`) is relocated into a subfolder —
`home/` for the tools origin, `energy/` for the energy origin — and served back by
rewrites, rather than sitting at the root where the wrong origin's copy would win.
Energy pages reference shared files by climbing-relative paths (`../../assets/…`) so
the same reference resolves correctly on both the served origin and in node.

## The design system

Every tool renders in both light and dark, always, driven by design tokens rather
than raw colour values, and the viewer's chosen theme beats the media query. Every
colour is contrast-validated against the real surface, in both themes, before it's
committed.

The visual language is consistent enough that the tools read as one family: a
display face for headings over a system body; capsule pills that carry a tinted
fill *and* a coloured label (never colour alone, so they survive colour-blindness
and greyscale export); short accent bars; a certainty fade for less-committed
content and a dashed ghost for placeholders; and one spatial system shared across
every tool. A new tool ships with the full artefact anatomy — a titled header with
a date and a metrics line, a treated surface with in-plane labels, deliberate mark
weights, content-driven height, and a single quotable **verdict** line. Diagrams
export from source as SVG/PNG/slide, independent of on-screen zoom.

Phones are a first-class target, not an afterthought. Tap targets clear 44px; text
inputs are at least 16px so iOS doesn't zoom the page; and board-width diagrams pan
rather than shrink below legibility. Below a narrow width, a tool re-lays-out rather
than merely scaling down, with the exports pinned to the wide artefact. Every
animation respects `prefers-reduced-motion`.

## How correctness is enforced

The standard here *is* the checks — the suites are the trade for having no error
telemetry in production (the no-tracking promise outranks debuggability).

Because the core is pure, most of it is tested in node: every parser, engine and
renderer has tests beside it. On top of that sit two kinds of standing gate:

- **Byte-exact golden regression.** Renderers emit SVG strings, so a corpus of
  golden SVGs can be compared byte-for-byte. A refactor that's meant to preserve
  behaviour has to leave the goldens identical; an intentional visual change
  re-captures them, once, on the record.
- **Meta-tests that make invariants self-enforcing** rather than memory-enforced.
  Every renderer must survive an injection corpus (XML/XSS) — and a meta-test fails
  if a renderer on disk isn't in that corpus. Every tool's page must carry the PWA
  head block — and a test fails if one doesn't. The precache lists, the per-page
  byte budgets, and this document's own file references are all checked the same
  way. When a rule that used to live in prose drifted, it became a test; that's the
  pattern.

Two more properties hold by test. SVG strings are XML, not HTML — the browser
forgives sloppiness inline that the export decoder rejects, so a well-formedness
test scans every golden (this shipped broken twice before it was a test). And the
node run is **serial**: one of the suites is a wall-clock performance benchmark, and
node parallelises test files by default, so a parallel run lets sibling suites steal
cores and flake the budget. Serial is deterministic; it's not optional.

The security posture is strict and static: a tight Content-Security-Policy
(`script-src 'self'` — no inline scripts, ever), no-sniff, no-referrer, no runtime
dependency, and no telemetry. The one deliberate backend exception is a tiny
ephemeral relay for the shared-estimation tool, which sees only numbers, never the
question, and forgets everything after a day.

---

*This file is the public companion to the repo's local working notes. It describes
what the code **is**; how work happens here (branching, gates, deploy) is separate.*
