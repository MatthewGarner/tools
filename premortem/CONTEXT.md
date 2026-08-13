# Premortem context

## Terms

- **Premortem** is a workshop that treats a future failure as already real, so a group can name failure modes before commitment makes them costly to raise.
- **Risk** is a failure mode. Risks may carry likelihood and impact ranges; only risks are exposure-ranked or included in the portfolio estimate.
- **Pre-parade** is the inverse workshop: it treats a future success as already real, then identifies the **opportunities** deliberately made true. It is not an optimistic risk register.
- **Opportunity** is an actionable condition that contributed to the stated success. It has no likelihood, impact, exposure, or portfolio number: those would manufacture confidence rather than record a commitment.
- **Success register** is the kept artefact from a pre-parade. It ranks opportunities by an explicit must-make-true mark and then the group’s action votes.
- **Board item** is a fact, assumption, or belief. It is neither a risk nor an opportunity until deliberately promoted into the current workshop’s register.
- **Action** is a concrete move attached to a risk or opportunity. Its owner and votes are workshop commitments, not evidence that the outcome will occur.

## Boundaries

`kind` in `register.js` is the canonical vocabulary: `risk`, `opportunity`, and the board kinds. A document's `mode` selects which register kind and language it uses. Legacy documents with no `mode` are risk premortems.

The two modes share facilitation mechanics (silent writing, clustering, actions, voting, review) but do not share scoring. A document does not switch modes after creation: mixing loss exposure with success conditions would make both records ambiguous.
