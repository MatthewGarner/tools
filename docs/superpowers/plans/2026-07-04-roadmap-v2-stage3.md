# Roadmap v2 Stage 3 — Drag-and-Drop as Text Editing

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Branch `roadmap-v2-stage3`; preview + review gate before merge.

**Goal:** Drag cards between lanes/horizons (and reorder within a cell); every drop is a text edit dispatched to CodeMirror, so text stays the source of truth and Cmd+Z undoes a drag (spec §3).

## Task 1: `edit.js` — pure `moveItem`, TDD

`export function moveItem(text, model, srcLine, target)` → `{text, cursorLine}` or `null` (no-op guard). `target = {h, lane, beforeLine}` where `beforeLine` is the srcLine of the card to insert before, or `null` for end-of-cell.

Semantics:
- The moved line's lane prefix is rewritten to `target.lane` (stripped when `''`); status tags and `--` notes travel untouched (they're part of the line body).
- `beforeLine != null` → insert immediately before that line (indices adjusted for the removal).
- `beforeLine == null` → insert after the last item line of the (h, lane) cell; if the cell is empty, directly after the horizon's header line (headers match parse's rule incl. trailing `:`).
- Config lines, comments, blank lines, and all other items are byte-preserved.
- No-op when the move lands the line exactly where it already is.

Tests (write first, watch fail, implement): horizon move; lane rewrite incl. to/from laneless; reorder before a card in the same cell; empty-cell drop; header-with-colon; status+note preservation; comment/config preservation; no-op same-position; move into last horizon at EOF without trailing newline.

## Task 2: `render.js` — cell hit zones

Under the cards (z-order first), one `<rect data-cell="<h>|<lane>" fill="transparent">` per lane×horizon covering the full cell column band. Cards already carry `data-line`. Test: rects present with correct count and data attributes.

## Task 3: `app.js` — pointer drag controller

- `pointerdown` on a `[data-line]` group arms a drag; it starts after 4px of movement (click stays click); `Escape` or pointerup outside cancels.
- Ghost: a small floating div with the item title following the pointer.
- Hit-testing via `document.elementsFromPoint` scanning for `data-cell` and nearest `data-line` in that cell (→ `beforeLine`); the hovered cell rect gets an accent stroke.
- Drop: `moveItem(...)`; if non-null, single CodeMirror dispatch replacing the doc (one transaction = one undo step), cursor moved to the moved line.
- CSS: `#preview svg g[data-line]{cursor:grab}`; dragging sets `cursor:grabbing` on body.

## Task 4: Browser checks + gate

Extend `dev/pw/check.mjs`: drag a card from NOW to NEXT with `page.mouse` (down, move in steps, up over the target cell), assert the editor text moved the line under `NEXT`, the preview re-rendered, and Cmd+Z restores the previous text. Then preview deploy → Matt review → merge.
