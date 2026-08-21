# Timeline

Timeline is the suite's **timing-forecast** instrument. Its executable
vocabulary is the parsed model in `parse.js`; this glossary fixes the meaning
around it.

## Language

**Milestone**:
A dated event or forecasted delivery point. An open milestone carries a P50–P90
range; it is not a delivery promise.

**Fixed event**:
A date outside the team's control, written `[fixed]`. It certifies the date,
not that every other milestone must precede it.

**Decision lead**:
An explicitly authored preparation time on a fixed event, written
`[lead: 6w]`. It is the time needed after a decision and before that event.
It is not a duration forecast and does not create a dependency graph.

**Last responsible moment (LRM)**:
The derived **decide-by** date: fixed-event date minus its decision lead. It
means “decide by this date to retain the stated lead time”, not “the decision
will happen then” and not “the downstream event is guaranteed”.

**Decision clock**:
The visible Timeline receipt for a decision lead: its derived decide-by date,
the stated lead, and the fixed event that anchors it. A closed clock is an
urgent planning condition, not a rewritten forecast.

**Merge risk**:
The probability-modelled chance that all independent lane forecasts clear a
date. It remains separate from a decision clock; `[fixed]` alone does not make
an event a binding programme dependency.

## Field contract

Timeline is a calibrated **Field**, not a delivery board. Every live form,
native SVG and presentation uses the same chronological vocabulary: a forecast
has a P50 point, its interval ends in a P90 cap, and a fixed event is a vertical
fact. The field's rules and shared ruler establish place; they are not
commitment bars. Done may be green and an overdue fixed event may be red. Risk,
forecast movement and ordinary uncertainty must remain legible through text and
geometry without depending on colour.

The DSL is visible in the artefact, not merely retained in parsing:

- `palette` and `accent` derive the paper and rule scheme in every Field output;
  they never turn uncertainty into decorative badges.
- An authored note is a measured secondary fact beneath its milestone dates in
  live, native, presentation and Markdown output. It wraps rather than clips.
- An authored verdict occupies the Field receipt; `verdict: off` removes that
  receipt while leaving other facts intact. A live decision clock remains
  independently visible.

Comparison identifies an item by normalized lane, label and its occurrence
within that lane. Moving a milestone to another lane is deliberately a drop plus
a new milestone: lane membership is a meaningful portfolio fact and the DSL has
no stable ID to claim otherwise. A change may therefore preserve historic P50,
historic P90, both, or a former fixed/forecast state; historic marks are inert
and visually distinguishable by construction, never colour alone.

Native SVG is exhaustive and may grow vertically. Copy PNG is a single complete
1920×1080 Field only: it must contain every milestone, note and receipt above
its footer. When the measured Field cannot fit, Copy PNG clearly refuses and
directs the author to exhaustive SVG; it never silently selects, crops or turns
the remainder into a partial presentation. If a future output introduces
continuation pages, each repeats its header and scale and no interval is split
at a page boundary.

Live editing stays quiet at rest, but never undiscoverable: every milestone has
an accessible menu, every named lane plus the unlaned field has an add route,
and keyboard focus reveals the relevant control. Escape cancels without source
change; invalid input remains visibly invalid; commit and undo return focus to
the initiating Field target. Popovers remain on-screen at every supported
viewport. The canonical URL carries only source state (never a visual-direction
switch); snapshots, Premortem handoff, next-up selection and motion all retain
their existing semantics.
