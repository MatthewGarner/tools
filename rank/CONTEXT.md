# Rank stability

Rank is a sensitivity review for an authored WSJF-style priority order. It
perturbs the stated criterion weights and item scores, then shows how often
each initiative enters the chosen top-*k*. It is not a forecast, evidence
store, delivery plan, or decision recommendation.

## Language

**Settled place**: an item that remains in the chosen top-*k* in at least 85%
of the simulation runs under the authored wobble. It means the ranking is
stable under those assumptions, not that the item should be funded.

**Contested place**: a top-*k* place whose membership changes under the
authored wobble. Resolve it with strategy, sequencing, or better inputs; the
simulation must not manufacture a winner.

**Weight wobble**: the stated 90% uncertainty interval applied to criterion
weights. It represents disagreement about relative importance, not a
probability that a criterion is true.

**Score wobble**: the stated perturbation applied to initiative scores. It
expresses imprecision in the authored scorecard, not delivery or outcome risk.

**Knife edge**: an item whose deterministic rank changes after a ±10% change
to one criterion weight. It is a local fragility probe, distinct from the
Monte Carlo top-*k* probability.
