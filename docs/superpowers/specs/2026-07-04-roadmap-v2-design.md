# Roadmap-as-code v2 — design

Date: 2026-07-04 · Status: approved · Scope: `roadmap/` in the tools monorepo

## Goal

Four user requirements, one architecture change:

1. **Editor must be accurate, responsive, fast.** The v1 syntax-highlighting overlay (transparent textarea over a highlighted `<pre>`) is fragile (scroll sync, sub-pixel alignment, ghosting) and the refresh path is wasteful (snapshot re-parsed per keystroke in compare mode; full SVG innerHTML swap every refresh).
2. **Drag-and-drop** of items between lanes/horizons, propagating to the text.
3. **Slide-ready, immaculate output** — a dedicated design pass on the rendered diagram.
4. **User-selectable colour palette.**

Constraint (Matt, 2026-07-04): single-file is not a hard rule; the rule is each tool does its one job exceptionally well. Multi-file is fine where more maintainable.

## Architecture

```
roadmap/
├── index.html            # shell, layout, about copy
├── style.css             # page styles (extracted from v1 <style>)
├── parse.js              # DSL → model; each item records its source line index
├── render.js             # (model, tokens, diff, mode) → SVG string
├── editor.js             # CodeMirror 6 setup: language, theme, keymaps
├── edit.js               # pure text mutations (moveItem) — no DOM
├── app.js                # state, refresh loop, exports, snapshots, drag controller
└── vendor/codemirror.js  # bundled ESM build, version pinned in header comment
```

Plain ES modules (`<script type="module">`), no build step. Node tests import `parse.js` and `render.js` directly (replaces v1's string-slicing test harness).

## 1. Editor (CodeMirror 6)

- Vendor one bundled ESM file (built once with esbuild from pinned package versions; build command recorded in the file header and README). Committed to the repo — no CDN, no install step for contributors.
- Language: line-based tokenizer matching `parse.js` semantics — config keys, horizon headers, `Lane:` prefixes, `[status]` tags (coloured per status token), `-- note`, `//` comments.
- Theme reads the site's CSS variables; correct in light and dark, palette-independent.
- Keymaps: default + Alt+↑/↓ (moveLine), Mod+/ (toggle `//` comment).
- Change handling: CM `updateListener` → debounced (~150ms) refresh.

### Perf (applies regardless of editor)
- Memoise the compare snapshot: re-parse only when the snapshot selection or its source changes, not per keystroke.
- Coalesce refresh through `requestAnimationFrame`; skip the DOM write when the rendered SVG string is unchanged.
- Target: keystroke → preview update under one frame at typical roadmap sizes (≤100 items).

## 2. Renderer design pass

- Restructure `render.js` around a token object: type scale, spacing scale, radii, colour roles. Slide mode = same tokens at 1.35× with deck-appropriate sizes.
- Visual upgrades: tinted status pills (label on tinted rounded rect, not dot+caps); title block with proper hierarchy; wrap with widow control (no single-word last lines); refined lane labels; redesigned legend; consistent optical spacing.
- Process: run the `frontend-design` skill at implementation; iterate on rendered output with Matt — visual sign-off is his, not headless tests.
- New export: **Copy PNG** to clipboard (`ClipboardItem`), alongside existing SVG/PNG/slide-PNG downloads.

## 3. Drag-and-drop (text is still the source of truth)

- `parse.js` records `srcLine` per item. `render.js` stamps card groups with `data-item` and cells with `data-cell="lane|horizon"` plus full-cell transparent hit rects.
- Pointer-event drag controller in `app.js`: ghost follows pointer; cells highlight on hover; Escape cancels.
- **A drop is a text edit dispatched to CodeMirror**: the item's line is removed and re-inserted at the drop position — under the target horizon header, with the lane prefix rewritten if the lane changed, before the hovered card when dropping onto one (reorder), at cell end otherwise. Because it flows through CM's history, **Cmd+Z undoes a drag**.
- Pure function `moveItem(text, srcLine, target) → {text, cursorLine}` in its own module `edit.js` (imported by `app.js`; no DOM) — unit-tested headless for: horizon move, lane rewrite, reorder before card, lane-less → laned cell, header-with-colon variants, preservation of comments/config lines.

## 4. Palettes

- DSL: `palette: <name>` (named set: `ocean` (default, current blue), `slate`, `ember`, `plum`) and `accent: #hex` for arbitrary brand colours (used as given; named palettes are the validated path).
- Every named palette validated with the dataviz `validate_palette.js` script against both theme surfaces before hardcoding.
- Palette affects diagram accent roles only (headers, lane accents, NEW badges). Status colours are semantic and fixed. Page chrome keeps the series identity.
- Travels with URL state and exports, like every other config line.

## Out of scope (deferred)

Present mode, PDF export, item URLs as clickable links (stage ④ if trivial), template systems, per-item colour overrides.

## Sequencing — four shippable stages

1. **Modules + CodeMirror + perf** — editor feels fast; behaviour otherwise unchanged; tests migrated to real imports.
2. **Design pass + palettes + Copy PNG** — output immaculate; iterate with Matt.
3. **Drag-and-drop** — the moveItem engine tested headless first, then the pointer UI.
4. **Polish** — clickable links, leftovers, docs.

Each stage deploys to tools.matthewgarner.me/roadmap independently.

## Testing

- `parse.js` / `render.js`: existing 30 checks migrated to ESM imports, plus srcLine tracking cases.
- `moveItem`: the edge-case suite above.
- Editor/drag interaction and visual quality: manual, in-browser, with Matt.
