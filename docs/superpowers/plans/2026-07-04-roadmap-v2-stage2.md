# Roadmap v2 Stage 2 — Design Pass + Palettes + Copy PNG

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). This stage is visual iteration — tasks below define the mechanical scope; visual acceptance is Matt's, via Vercel preview deploys and Playwright screenshots.

**Goal:** Slide-grade rendered output (spec §2), DSL palettes (spec §4), Copy-PNG-to-clipboard, and a repo-resident browser test harness.

**Architecture:** `render.js` restructured around a `TOKENS` object (type/spacing/radius scale, colour roles); palettes resolve to concrete hexes per theme, validated with the dataviz validator before hardcoding. Browser harness moves from scratchpad to `dev/pw/` (own package.json — kept out of repo root so Vercel keeps treating the site as static).

## Global Constraints
- All palette hexes pass `validate_palette.js` on both theme surfaces before commit.
- Status colours stay semantic and fixed; palettes touch accent roles only (horizon headers, NEW badge, legend key, lane accents).
- Page chrome keeps the series identity; palette affects the diagram only.
- Existing 18 node tests + 14 browser checks keep passing; new features add tests.
- Branch `roadmap-v2-stage2`; preview deploy for Matt's visual sign-off before merge.

### Task 1: Browser harness into `dev/pw/`
Move parity-check from scratchpad into `dev/pw/` (package.json with playwright pinned, `check.mjs`, README line on usage). Verify it runs against a local server.

### Task 2: `TOKENS` refactor in render.js (no visual change)
Extract every magic number (font sizes, line heights, paddings, radii) into a `TOKENS` object consumed by `render()`; screenshots before/after must be pixel-identical (compare via Playwright screenshot buffers).

### Task 3: The design pass (visual, iterative)
Load `frontend-design:frontend-design`. Upgrade within `render.js`: tinted status pills, widow-controlled wrapping, refined title block, small-caps lane labels, redesigned legend, header treatment, slide-mode typography. Iterate on screenshots (light/dark/slide) until craft-clean, then Matt judges on preview.

### Task 4: Palettes + `accent:` in the DSL
`parse.js`: `palette:` and `accent:` config keys (+ tests). `render.js`: palette resolves accent roles per theme. Validate ocean/slate/ember/plum hexes (light+dark surfaces) with the validator; record results in the commit message. Unknown palette name → warning, default ocean.

### Task 5: Copy PNG to clipboard
Button beside downloads; canvas → `ClipboardItem({'image/png': blob})`; graceful fallback message where the API is unavailable. Browser check asserts the button enables and the clipboard call is invoked (Playwright `context.grantPermissions(['clipboard-write'])`).

### Task 6: Preview deploy + review gate → merge on approval
Same gate as stage 1.
