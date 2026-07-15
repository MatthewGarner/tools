# Small, sharp tools

Utilities for product work under uncertainty. Live at [tools.matthewgarner.me](https://tools.matthewgarner.me).

| Tool | Path | What it does |
|---|---|---|
| Fermi estimator | [/fermi](https://tools.matthewgarner.me/fermi/) | Ranges in, P10/P50/P90 distribution out — Monte Carlo estimation with value-of-information sensitivity, a deck-ready driver-tree view, and a cashflow mode (NPV / IRR / payback / runway as distributions) |
| Rank stability | [/rank](https://tools.matthewgarner.me/rank/) | Wobbles prioritisation weights and scores to show which ranks are signal and which are noise |
| Roadmap as code | [/roadmap](https://tools.matthewgarner.me/roadmap/) | Plain-text DSL → deck-ready roadmap graphic: drag-and-drop that edits the text, snapshot diffs, palettes, SVG/PNG export |
| Decision tree sketcher | [/tree](https://tools.matthewgarner.me/tree/) | Expected-value trees with honest uncertainty: 90% ranges, Monte Carlo rollback, and what would flip the decision |
| Why | [/why](https://tools.matthewgarner.me/why/) | An Opportunity Solution Tree and a roadmap as projections of one text file — columns derived from discovery status, audits for roadmap items with no why |
| Map | [/map](https://tools.matthewgarner.me/map/) | Plane + zones with method presets — assumption mapping, stakeholder grids, futures matrices, risk registers; drag-to-place edits the text |
| Gauge | [/gauge](https://tools.matthewgarner.me/gauge/) | Shared-session crowd estimation: everyone answers privately (probabilities, 90% ranges), the facilitator reveals the room's spread at once — before anchoring sets in |
| Timeline | [/timeline](https://tools.matthewgarner.me/timeline/) | Milestones as P50–P90 ranges with uncertainty whiskers — and a snapshot compare that renders the slip slide for the next board pack |
| Flow playground | [/flow](https://tools.matthewgarner.me/flow/) | Little's Law made visceral: demand, team, WIP limit and variability drive a living queue — see how much of cycle time is waiting, price your batch size on the U-curve, and triage which lever clears a real backlog fastest |
| Wardley map | [/wardley](https://tools.matthewgarner.me/wardley/) | Plain-text DSL → a Wardley map: components placed by evolution across the value chain, dependencies drawn, and the strategic reading surfaced — what's load-bearing, what to build vs buy; tap-to-place editing on phones |
| Base-rate playground | [/alarm](https://tools.matthewgarner.me/alarm/) | Base-rate neglect made visceral: 1,000 cases through a signal-detection gate; drag the threshold and watch the alarm bin fill with false alarms as the base rate drops, with the natural-frequency verdict ("9 in 10 alarms are false") |
| Pairwise showdown | [/duel](https://tools.matthewgarner.me/duel/) | Prioritise by rapid two-tap duels instead of scoring — the order falls out (Copeland, no invented numbers), and the A>B>C>A loops that expose criteria pretending to be one are found and asked to be named |
| Premortem | [/premortem](https://tools.matthewgarner.me/premortem/) | Imagine it already failed and work backwards — a staged workshop into a living, EV-ranked risk register with honest ranges (not a red/amber/green grid), plus a Facts/Assumptions/Beliefs board that promotes into it |
| Bets board as code | [/bets](https://tools.matthewgarner.me/bets/) | The portfolio as explicit bets: a DSL of stake/odds/payoff/kill → a deck-ready blotter with stamped audits (NO KILL CRITERION, ODDS IMPLY CERTAINTY, LOSES AT P50), a Monte-Carlo P(loses money), and a risk-return quadrant second view |

**Energy tools** live on a second domain — [energy.matthewgarner.me](https://energy.matthewgarner.me) (cycle budget, risk transfer, merit order, frequency & inertia, a day through the stack). Same repo, same rules; see [`energy/README.md`](energy/README.md).

Rules of the series: each tool does one job exceptionally well — no accounts, no tracking, no runtime dependencies or build step (CodeMirror is vendored as a committed bundle; everything ships as static files). State lives in the URL so every model is a bookmarkable, shareable link. Gauge carries the series' one deliberate backend exception: a tiny ephemeral relay (`api/gauge/` + Upstash Redis) that sees only numbers, never questions, and forgets everything after 24 hours — the questions still live in the URL.

**How it's built:** one folder per tool (`<tool>/index.html` + pure ES modules, tested in node), shared code in `assets/`, two public domains served from one repo, and correctness held by byte-exact golden SVGs plus a set of self-enforcing meta-tests. The full picture — the parse → project → render → app spine, why the text (not the DOM) is the model, the two-origin serving trick, and how the checks are the standard — is in [`ARCHITECTURE.md`](ARCHITECTURE.md). Dev harness in `dev/` (Playwright suites under `dev/pw/`, `dev/golden.mjs` for SVG regression; node suites live beside each tool in `<tool>/tests/`). `api/` holds the one backend exception (the gauge relay). The DSL grammars for the text-driven tools are documented together — one LLM-pasteable reference — in [`DSL.md`](DSL.md).

Built with Claude Code, 2026.
