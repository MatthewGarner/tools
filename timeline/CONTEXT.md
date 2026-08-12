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
