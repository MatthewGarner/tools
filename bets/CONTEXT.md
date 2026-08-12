# Bets

Bets is the suite's portfolio-allocation context. Its canonical executable
vocabulary is the parsed model in `parse.js` and simulated result in `engine.js`.

## Language

**Bet**:
A concurrent allocation with a stake, a marginal success-odds range, a payoff
range and optionally a kill criterion. _Avoid_: Decision, roadmap item.

**Portfolio**:
The set of Bets whose realised outcomes are summed. Its loss reading depends on
the declared outcome scenario; it is not the expected value of one Bet.

**Independent baseline**:
The scenario in which every Bet resolves from its own random draw while retaining
its authored marginal odds. This is the existing model, not a claim about reality.

**Shared-outcome stress**:
The maximum-positive-co-movement scenario compatible with each Bet's authored
marginal odds: one shared draw resolves every Bet. It is a stress reading, not a
correlation coefficient or a causal dependency graph.

**Median outcome**:
The P50 of realised Portfolio outcomes. _Avoid_: Net EV.

**Kill criterion**:
The authored condition that says when a Bet should stop. It is an audit of one
Bet, not a probability input.
