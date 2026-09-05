# Timeline

Timeline is the suite's **timing-forecast** instrument. Its executable
vocabulary is the parsed model in `parse.js`; this glossary fixes the meaning
around it.

## Language

**Milestone**:
A dated event or forecasted delivery point. An open milestone carries a P50–P90
range; it is not a delivery promise.

**Actual start**:
An authored, observed work-start date: `[started: YYYY-MM-DD]`. It is optional,
never inferred from the finish distribution and never a planned start. An actual
start plus P50/P90 finish gives estimated calendar spans, not effort, progress or
a duration distribution. Completed work ends elapsed time at its actual finish;
open work uses the same effective UTC today as the chart. Contradictory future or
post-finish starts remain visible as authored facts with warnings, but calculate
no duration. Fixed external events cannot carry work starts.

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

- `font` selects the same locally bundled Chapter or DM Sans typography used by
  Roadmap. `style` selects field, review, decisions or register; the picker writes
  this canonical source setting, not a second hidden visual state. Review requires
  a separately selected snapshot baseline.
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
historic P90, actual start, or a former fixed/forecast state; historic marks are inert
and visually distinguishable by construction, never colour alone.

Native SVG is exhaustive and may grow vertically. Presentation exports must
account for the complete selected view: every milestone, note, decision clock
and historic dropped item. A single-slide copy must refuse if it cannot fit;
complete slide sets paginate rows and commentary while repeating the header,
lane context and identical chronological scale on every page. No interval may
be divided across a page boundary, silently selected away or cropped. Font
measurement and painting use the same font, and detached exports embed it.

Live editing stays quiet at rest, but never undiscoverable: every milestone has
an accessible menu, every named lane plus the unlaned field has an add route,
and keyboard focus reveals the relevant control. Escape cancels without source
change; invalid input remains visibly invalid; commit and undo return focus to
the initiating Field target. Popovers remain on-screen at every supported
viewport. The canonical URL carries source state, including its declared view and font; snapshots, Premortem handoff, next-up selection and motion all retain
their existing semantics.
