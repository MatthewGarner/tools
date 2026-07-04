# Small, sharp tools

Utilities for product work under uncertainty. Live at [tools.matthewgarner.me](https://tools.matthewgarner.me).

| Tool | Path | What it does |
|---|---|---|
| Fermi estimator | [/fermi](https://tools.matthewgarner.me/fermi/) | Ranges in, P10/P50/P90 distribution out — Monte Carlo estimation with value-of-information sensitivity |
| Rank stability | [/rank](https://tools.matthewgarner.me/rank/) | Wobbles prioritisation weights and scores to show which ranks are signal and which are noise |
| Roadmap as code | [/roadmap](https://tools.matthewgarner.me/roadmap/) | Plain-text DSL → deck-ready roadmap graphic: drag-and-drop that edits the text, snapshot diffs, palettes, SVG/PNG export |

Rules of the series: each tool does one job exceptionally well — no accounts, no tracking, no runtime dependencies or build step (the roadmap tool vendors CodeMirror as a committed bundle; everything ships as static files). State lives in the URL so every model is a bookmarkable, shareable link. Dev harness in `dev/` (Playwright browser checks + golden SVG regression).

Built with Claude Code, 2026.
