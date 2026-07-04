# Decision-tree sketcher (`/tree`) — design

Date: 2026-07-04 · Status: approved · Scope: new tool at `tree/` in the tools monorepo (#14 on the vault roadmap)

## Goal

Small expected-value decision trees with the series' honest-uncertainty signature: payoffs and probabilities accept 90% ranges, rollback is Monte Carlo, and the output is a distribution and a defensible sentence — "Submit bid: EV £1.1M (P10 −£600k, P90 £3.2M) — wins in 78% of simulations · flips if p(Win) < 0.42" — plus a deck-ready diagram.

## 1. DSL

Indentation-based (2 spaces per level). Node types are inferred, never declared:

```
title: Bid for the Acme contract
currency: £

Bid decision
  Submit bid: -150k
    Outcome
      Win (p=0.3-0.45): 2M to 5M
      Lose (p=rest): 0
  No bid: 0
```

- **Chance node** (circle): any child carries `(p=…)`. **Decision node** (square): children without probabilities — the tool picks the best option. **Leaf**: no children.
- A `: value` on any line is a cash flow at that point on the path (net-path semantics) — branch costs are negative values on option lines. Leaves without a value are 0 (warned).
- Numbers: point or 90% range. Range separators: `-` when both ends are non-negative, `to` always (required when negatives are involved). Suffixes k/M/B. Probabilities are plain numbers 0–1 (or ranges). One sibling per chance node may use `p=rest` (remainder after the others).
- Config lines: `title:`, `currency:` (`£` default; `$`/`€` accepted), `palette:`/`accent:` (identical semantics and validated schemes as the roadmap tool). `//` comments.
- Warnings (never hard errors): sibling point-probabilities not summing to ~1 (sampled values are normalised per simulation anyway); leaf without value; child of a chance node missing `p=` when no `rest` sibling exists (treated as `p=rest` if it's the only one, else warned and given p=0); mixed indentation; unreachable depth jumps.
- Parse output: `{title, currency, palette, accent, root, warnings}` with nodes `{label, kind: 'decision'|'chance'|'leaf', value: {lo, hi}|null, p: {lo, hi}|'rest'|null, children[], srcLine}`.

## 2. Engine (`engine.js`, pure — no DOM)

- **Sampling** (10,000 sims, seeded mulberry32 from `assets/series.js`): payoff ranges use Fermi conventions — log-normal fitted to the 90% interval when `lo > 0`, normal otherwise; point values pass through. Probability ranges sample normal from the 90% interval, clamp to [0, 1]; each chance node's sibling probabilities are then normalised to sum to 1 per simulation (`rest` = 1 − others, floored at 0).
- **Policy, not hindsight**: decisions are made once. Rollback computes each option's EV distribution across all sims, picks the option with the highest **mean** EV at every decision node (deepest first), and freezes that policy; upstream results use only chosen branches. Per-simulation argmax is explicitly not used.
- **Per-node results**: mean, P10/P50/P90 of the node's value distribution under the policy.
- **Head-to-head** (root decision only): for each pair of options, share of paired simulations where one beats the other.
- **Flip analysis**: for each probability input on or feeding the recommended path, hold everything else at range midpoints, deterministic mean rollback, bisect the probability in [0,1] for the recommendation-change threshold; report as "flips if p(X) < 0.42" (or >). For each payoff range: evaluate at both interval ends; report ranges whose ends produce different recommendations. Skip reporting when no flip exists in-range.
- API: `evaluate(model, {sims = 10000, seed = 0x5EED})` → `{policy: Map<node, chosenChild>, stats: Map<node, {mean, p10, p50, p90}>, headToHead[], flips[], warnings[]}`.

## 3. Render (`render.js`, pure — `(model, results, ctx)` → SVG string)

- Left-to-right tidy tree: leaves evenly spaced vertically, parents centred on their children; depth → x. Squares (decision), circles (chance), small terminal ticks (leaves).
- Edge labels: option label; probability shown as given (`0.3–0.45`) on chance edges; branch cash flows shown signed (`−£150k`).
- Node annotations: mean EV headline + `P10 … P90` beneath, in the series' type scale. Money formatting = currency symbol prefixed to `fmt`'s compact output, minus sign before the symbol (`−£150k`).
- **Recommended path**: bold accent stroke through nodes and edges; non-chosen decision branches render at reduced opacity (same fade vocabulary as the roadmap's certainty fade).
- Verdict block above the tree: recommendation sentence + head-to-head; flip conditions listed beneath the tree in muted type.
- Palettes/schemes (`scheme(accent, dark)`) shared with the roadmap tool — extract that function into `assets/series.js` rather than duplicating.
- Exports: SVG, PNG (2×), slide-size PNG (1.35× tokens), Copy PNG to clipboard. Golden-SVG regression via `dev/golden.mjs` extended with tree fixtures.

## 4. App shell

- `tree/` mirrors `roadmap/`: `index.html`, `style.css` (page rules only; tokens from `assets/tokens.css`), `parse.js`, `engine.js`, `render.js`, `editor.js`, `app.js`.
- Editor: CodeMirror from the existing vendored bundle; tree tokenizer (config keys, `(p=…)` tags, values, comments); same theme and keymaps.
- State: URL hash carries the source text; localStorage autosave; saved-trees chips (same pattern as roadmap).
- Examples: "Bid or no bid" (the spec's tree) and "Build vs buy" — both generic, no employer specifics.
- Landing page card + README row.

## Out of scope (v1)

Drag-editing the tree, utility functions / risk aversion, sequential option valuation, data import, node collapsing.

## Testing

- `parse`: inference of node kinds, ranges incl. `to` and negatives, `p=rest`, warnings, srcLine tracking.
- `engine` (deepest suite): deterministic seeding; policy-vs-hindsight (construct a case where per-sim argmax would differ from fixed policy and assert the policy result); `p=rest`; per-sim normalisation; nested decisions; head-to-head on a known asymmetric case; flip bisection against an analytically solvable tree; degenerate trees (single leaf, decision with one option).
- `render`: well-formed SVG, no NaN, recommended-path accent present, faded rejected branch, escaping.
- Browser: smoke (loads, example renders, verdict present, both themes, no console errors) + editor flow (type, undo, URL round-trip) + exports clickable.
- Golden: two fixture trees, light ctx, plain + slide.

## Sequencing — two shippable stages

1. **Engine-first**: parse + engine fully tested headless, minimal render (tree draws, policy highlighted), app shell wired, deploy behind preview.
2. **Craft**: verdict block, flip display, design pass on the diagram, examples polish, exports, golden + full browser suite, landing card, production.
