# Little Energy tools

Single-job utilities for energy commercial work under uncertainty — revenue risk, route-to-market, and the conversations around them. Live at [energy.matthewgarner.me](https://energy.matthewgarner.me).

| Tool | Path | What it does |
|---|---|---|
| Risk transfer | [/risk](https://energy.matthewgarner.me/risk/) | Merchant, floor, toll or insure — every route-to-market drawn as a payoff on the *same* uncertain year, so you can see which structure you're actually buying and what it costs at P10/P50/P90 |
| Cycle budget | [/cycles](https://energy.matthewgarner.me/cycles/) | A battery's warranty is a budget and every cycle spends it — what a cycle is worth today, whether the second cycle pays this year, and when augmentation stops being early and starts being late, priced from one set of beliefs |
| Frequency & inertia | [/frequency](https://energy.matthewgarner.me/frequency/) | Trip a generator and watch the grid catch itself — system inertia, RoCoF and the battery's fast frequency response, as a single-bus SFR simulation across the NESO Dynamic services |
| Merit order | [/merit-order](https://energy.matthewgarner.me/merit-order/) | Stack the GB fleet cheapest-first, drag demand across it, and watch one marginal plant set the price for everyone — negative prices, the gas staircase, and the BESS-before-gas story, across FES 2035 worlds |
| A day through the stack | [/intraday](https://energy.matthewgarner.me/intraday/) | Play 24 hours of demand through the merit order — the price shape draws itself, then storage arbitrages the peaks into the troughs and flattens it |

Same rules as the [main series](../README.md): each does one job exceptionally well — no accounts, no tracking, no runtime dependencies or build step, state in the URL so every model is a shareable link. Energy examples use the fictional **Wexcombe 100MW/2h** BESS — no real-project specifics. The accent is ember (`#C05621`), contrast-validated against both themes.

## One repository, two origins

These energy tools live in the **same repository** as the main product tools ([tools.matthewgarner.me](https://tools.matthewgarner.me) — see the [root README](../README.md)) and share all of `assets/` (design tokens, maths/state primitives, render helpers, app-shell plumbing) and the `dev/` test harness. They are simply served on a **second domain**:

- `tools.matthewgarner.me` serves the repository root — one folder per tool (`/fermi`, `/roadmap`, …) straight off the filesystem.
- `energy.matthewgarner.me` serves the **`energy/` subtree** — `energy.matthewgarner.me/cycles/` resolves to `energy/cycles/` — via host-conditioned rewrites in `vercel.json`.

The path map that both origins derive from lives **once** in [`dev/origins.mjs`](../dev/origins.mjs) (a test enforces that `vercel.json`, the local dev server, and the service-worker precache never drift from it). Two consequences worth knowing:

- **Vercel serves the filesystem *before* rewrites**, so a real file at a path always wins over a rewrite to it. That's why each origin's landing page, service worker and manifest are relocated into subfolders (`home/` for tools, `energy/` for energy) and served back by rewrites — a root `index.html` would otherwise shadow the energy origin.
- **Energy pages reference shared code by climbing-relative paths** (`../../assets/…`, not `/energy/…`). The same file then resolves correctly on the energy origin, on the tools origin, *and* under the node test harness — never hardcode an origin-absolute path inside an energy page.

## Layout

One folder per tool, same pure-core / DOM-shell anatomy as the main series:

```
energy/
  <tool>/
    parse.js        DSL → model (pure)
    engine.js       model → simulation / metrics (pure, seeded Monte Carlo)
    render.js       model + sim → SVG string (pure)
    editor.js       CodeMirror wiring (vendored editor, no runtime deps)
    app.js          the DOM shell — sliders/editor, exports, hash-state
    index.html, style.css
    tests/          node test suites beside the tool (*.test.mjs)
  index.html        the energy-origin landing
  sw.js             the energy-origin service worker (offline-first)
  manifest.webmanifest, icons/
```

Everything is pure and node-testable except `app.js` (which owns the DOM). Renderers emit SVG strings; the same `dev/` harness that covers the main tools (Playwright smoke/mobile/webkit, golden SVG regression, injection corpus) covers these — the energy test globs are `energy/*/tests/*.mjs`.

Built with Claude Code, 2026.
