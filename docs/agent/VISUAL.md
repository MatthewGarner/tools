# Visual work

Read this for visible layout, styling, SVG, motion, or interaction changes.

Both themes and phones are first-class output. Use design tokens rather than raw
colours; validate any new palette against its real surface. Tap targets are at least
44px, text inputs at least 16px, and wide artefacts pan or re-layout rather than
shrinking below legibility. Motion respects reduced-motion.

Inspect the actual screenshots before offering a preview. For a new or substantially
changed tool, compare the desktop and phone contact sheets against a shipped sibling
with `dev/pw/bar.mjs`; exports remain based on the wide artefact. Capture goldens only
for intentional visual changes, then use the normal gate before review.

## Instrumental editorial systems

When a tool needs a presentation-quality visual family, begin with the reading job of
each view, then give every view one strong spatial primitive. Do not make a single
generic dashboard/card pattern wear four labels. Roadmap established this useful
precedent:

- time and sequence → an occupancy field whose physical width communicates duration;
- portfolio and commitment → an open ruled ledger;
- a decision or narrative → one dominant reading surface plus a factual rail;
- accountable review → a formal table with explicit fields.

The family can still share one grammar: a strict grid, strong type hierarchy, flat
forms, square geometry, generous paper, hairline rules, and purposeful asymmetry.
Colour is a semantic signal (for example, commitment state), not an ornament, brand
stripe, or substitute for hierarchy. Prefer removing a mark, fill, label, or border
to adding one. Repeated facts should normally appear once in the place that owns them:
for example, a Grid lane belongs in its rail, while a span is legible through width.

Live and exported forms are one system projected for different jobs. Live preserves
scanability, drag targets, and contextual controls; resting authoring affordances stay
quiet and appear on hover/focus. Export privileges five-second comprehension and must
never fall back to a legacy card treatment. Keep the semantic DSL and renderer model
as the common source of truth rather than styling a second, incomplete export path.

Treat export pagination as layout, not an item-count bucket. Estimate or measure the
same packed tracks, rows, wrapping and footer reserve that the renderer uses. A normal
representative fixture should remain one deliberate 16:9 artefact in every selected
view; dense or wordy work earns continuations before any content reaches the footer.
Lock that expectation with a regression alongside overflow tests.

The review bar for this class of work is desktop, phone, dark theme, complex data
(including overlapping/spanning work), and actual Copy-PNG/page-set output—not an
isolated attractive screenshot. Use the golden suite and a fresh, harsh visual review
to challenge unnecessary marks, weak item delineation, export/live divergence, and
unearned blank space before calling the family complete.
