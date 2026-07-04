# Small, sharp tools

Utilities for product work under uncertainty. Live at [tools.matthewgarner.me](https://tools.matthewgarner.me).

| Tool | Path | What it does |
|---|---|---|
| Fermi estimator | [/fermi](https://tools.matthewgarner.me/fermi/) | Ranges in, P10/P50/P90 distribution out — Monte Carlo estimation with value-of-information sensitivity |
| Rank stability | [/rank](https://tools.matthewgarner.me/rank/) | Wobbles prioritisation weights and scores to show which ranks are signal and which are noise |
| Roadmap as code | [/roadmap](https://tools.matthewgarner.me/roadmap/) | Plain-text DSL → deck-ready roadmap graphic: drag-and-drop that edits the text, snapshot diffs, palettes, SVG/PNG export |
| Decision tree sketcher | [/tree](https://tools.matthewgarner.me/tree/) | Expected-value trees with honest uncertainty: 90% ranges, Monte Carlo rollback, and what would flip the decision |
| Why | [/why](https://tools.matthewgarner.me/why/) | An Opportunity Solution Tree and a roadmap as projections of one text file — columns derived from discovery status, audits for roadmap items with no why |

Rules of the series: each tool does one job exceptionally well — no accounts, no tracking, no runtime dependencies or build step (CodeMirror is vendored as a committed bundle; everything ships as static files). State lives in the URL so every model is a bookmarkable, shareable link.

Layout: one folder per tool (`<tool>/index.html` + ES modules); shared code in `assets/` (`tokens.css` design tokens, `series.js` maths/state primitives, `svg.js` render helpers, `app-common.js` app-shell plumbing — new tools import these; fermi/rank predate the module era and migrate when next touched). Dev harness in `dev/` (Playwright: `pw/smoke.mjs` covers every tool in both themes, `pw/check.mjs` is the roadmap deep suite; `golden.mjs` for byte-exact SVG regression; node test suites live beside each tool in `<tool>/tests/`).

Built with Claude Code, 2026.
