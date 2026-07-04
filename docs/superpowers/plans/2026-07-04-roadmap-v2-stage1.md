# Roadmap v2 Stage 1 — Modules + CodeMirror + Perf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the roadmap tool from the single scratchpad HTML file into `roadmap/` as ES modules with a vendored CodeMirror 6 editor and a fast refresh loop, at feature parity with v1.

**Architecture:** The v1 source of truth is `/private/tmp/claude-501/-Users-matthew-Vaults-Matt/7fae150c-fc5c-48dc-9294-a0118d4d4d9b/scratchpad/roadmap-as-code.html` (referred to below as `V1`). Its `<script>` is split into `parse.js`, `render.js`, `edit.js` (stub), `app.js`; its `<style>` becomes `style.css`; the textarea/overlay editor is replaced by CodeMirror 6 vendored as one bundled ESM file. `render()` gains an injected context (colors + text measurer) so tests run headless without DOM stubs.

**Tech Stack:** Vanilla ES modules, CodeMirror 6 (vendored, pinned), esbuild (build-time only, via npx), node:test for headless tests, Vercel static hosting.

## Global Constraints

- No build step for the deployed site: `vendor/codemirror.js` is committed; everything loads as native ES modules.
- No CDN/network dependencies at runtime (matches the rest of the tools site).
- Feature parity with V1: DSL (title/date/horizons incl. `quarterly from … xN` / `monthly from … xN`, wip, fade), snapshots/compare, saved roadmaps, markdown import, SVG/PNG/slide-PNG export, URL-hash + localStorage state, both themes.
- Design tokens/CSS custom properties keep v1 names (`--bg`, `--card`, `--ink`, `--muted`, `--accent`, `--st-done` …).
- Commit after every task; deploy only at Task 6.
- Perf target: keystroke → preview swap coalesced to one rAF; snapshot diff must not re-parse per keystroke.

---

### Task 1: `parse.js` with `srcLine` + migrated tests

**Files:**
- Create: `roadmap/parse.js`
- Create: `roadmap/tests/parse.test.mjs`

**Interfaces:**
- Produces: `export function parse(text)` → model `{title, dateStr, horizons[], lanes[], items[], warnings[], wip, fade}`; each item is `{lane, h, title, note, status, srcLine}` (`srcLine` = 0-based line index in the source text — new in v2). Also `export function genHorizons(spec)`, `export const STATUS_ALIASES`, `export const STATUS_LABEL`.

- [ ] **Step 1: Extract parse.js from V1**

Copy from `V1`'s script, verbatim: the `DEFAULT_HORIZONS`, `STATUS_ALIASES`, `STATUS_LABEL`, `MONTHS` constants, `genHorizons()`, and `parse()`. Add `export` to `parse`, `genHorizons`, `STATUS_ALIASES`, `STATUS_LABEL`. Then make one change inside `parse()` — record the source line on each item:

```js
// v1:  model.items.push({lane, h, title: line, note, status});
// v2:
model.items.push({lane, h, title: line, note, status, srcLine: ln});
```

- [ ] **Step 2: Write the test file (including a failing srcLine case)**

Create `roadmap/tests/parse.test.mjs` with node:test. Port every parse-related check from the two v1 test scripts (`roadmap-test.js`, `roadmap-test2.js` in the same scratchpad dir) — title/horizons/items/lane/status/note parsing, unknown-tag and orphan warnings, unnamed-lane-last, generators (quarterly incl. year wrap, monthly incl. full names, invalid → null), `wip`/`fade` configs — plus the new one:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, genHorizons} from '../parse.js';

test('items record srcLine', () => {
  const m = parse('title: X\n\nNOW\nA: first\n// c\nB: second');
  assert.equal(m.items[0].srcLine, 3);
  assert.equal(m.items[1].srcLine, 5);
});
```

- [ ] **Step 3: Run tests, verify all pass**

Run: `cd ~/repos/tools/roadmap && node --test tests/parse.test.mjs`
Expected: all pass (srcLine case included — Step 1 already made the change; if it fails, the extraction is wrong).

- [ ] **Step 4: Commit**

```bash
git add roadmap/parse.js roadmap/tests/parse.test.mjs
git commit -m "roadmap v2: extract parse.js with srcLine tracking + node:test suite"
```

---

### Task 2: `render.js` with injected context

**Files:**
- Create: `roadmap/render.js`
- Create: `roadmap/tests/render.test.mjs`

**Interfaces:**
- Consumes: model from `parse()` (Task 1).
- Produces: `export function render(model, ctx)` → SVG string. `ctx = {colors, measure}` where `colors` has the shape v1's `themeColors()` returned (`{card, border, ink, muted, accent, bg, err, status:{done,doing,risk,blocked}}`) and `measure(text, font) → number` (pixel width). Optional `ctx.diff` (`{badge(it), dropped[], since, any}`) and `ctx.slide` (boolean) replace v1's extra positional args. Card `<g>` elements additionally get `data-line="<srcLine>"` and cells are unchanged visually (drag hooks arrive in stage 3).

- [ ] **Step 1: Extract render.js from V1**

Copy verbatim from `V1`: `F` (font constants), `wrapText`, `esc`, and `render`. Changes:
1. Delete the module-level `meas` canvas and `themeColors()`. `wrapText` takes a `measure` function: `function wrapText(text, font, maxW, measure)` and uses `measure(trial, font)` instead of `meas.measureText`.
2. Signature `render(model, ctx)`; destructure `const {colors: C, measure, diff = null, slide = false} = ctx;`. Replace v1's internal `themeColors()` call and `diff`/`slide` params accordingly; pass `measure` through to every `wrapText` call and the legend width measurement.
3. On each card group, change `'<g opacity="…">'` to `'<g data-line="' + c.it.srcLine + '" opacity="…">'`.

- [ ] **Step 2: Write render tests**

Port the render checks from the v1 test scripts (dims present, no NaN, legend, XML escaping, wrap grows height, fade opacities on/off, WIP flag, diff badges NEW/WAS, dropped strip, slide scale wider) using a stub ctx — no DOM stubbing needed any more:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';

const ctx = () => ({
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'}},
  measure: (t) => t.length * 7,
});

test('cards carry data-line for drag targeting', () => {
  const m = parse('NOW\nA: item one');
  assert.match(render(m, ctx()), /<g data-line="1"/);
});
```

- [ ] **Step 3: Run tests**

Run: `cd ~/repos/tools/roadmap && node --test tests/`
Expected: parse + render suites all pass.

- [ ] **Step 4: Commit**

```bash
git add roadmap/render.js roadmap/tests/render.test.mjs
git commit -m "roadmap v2: extract render.js with injected colors/measure ctx and data-line hooks"
```

---

### Task 3: Vendor CodeMirror 6

**Files:**
- Create: `roadmap/vendor/codemirror.js` (committed build output)
- Create: `roadmap/vendor/BUILD.md`

**Interfaces:**
- Produces: one ESM file exporting `{EditorView, EditorState, Compartment, keymap, defaultKeymap, history, historyKeymap, drawSelection, highlightActiveLine, StreamLanguage, syntaxHighlighting, HighlightStyle, tags}` for Task 4.

- [ ] **Step 1: Build the bundle in the scratchpad**

```bash
cd /private/tmp/claude-501/-Users-matthew-Vaults-Matt/7fae150c-fc5c-48dc-9294-a0118d4d4d9b/scratchpad
mkdir cm-build && cd cm-build
npm init -y >/dev/null
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @lezer/highlight
cat > entry.js <<'EOF'
export {EditorState, Compartment} from '@codemirror/state';
export {EditorView, keymap, drawSelection, highlightActiveLine} from '@codemirror/view';
export {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
export {StreamLanguage, syntaxHighlighting, HighlightStyle} from '@codemirror/language';
export {tags} from '@lezer/highlight';
EOF
npx esbuild entry.js --bundle --format=esm --minify --outfile=codemirror.js
```

- [ ] **Step 2: Record provenance and copy into the repo**

```bash
VERSIONS=$(node -e "const p=require('./package.json').dependencies; console.log(Object.entries(p).map(([k,v])=>k+'@'+v.replace('^','')).join(' '))")
{ echo "// Vendored CodeMirror bundle — $VERSIONS"; echo "// Rebuild: see vendor/BUILD.md"; cat codemirror.js; } > ~/repos/tools/roadmap/vendor/codemirror.js
```

Write `roadmap/vendor/BUILD.md` containing the exact Step 1 commands and the pinned versions echoed above, so the bundle is reproducible.

- [ ] **Step 3: Smoke-test the bundle loads in node**

Run: `node -e "import('/Users/matthew/repos/tools/roadmap/vendor/codemirror.js').then(m => console.log(Object.keys(m).length + ' exports OK'))"`
Expected: `13 exports OK` (or the actual count — all names from the Interfaces list present).

- [ ] **Step 4: Commit**

```bash
git add roadmap/vendor/
git commit -m "roadmap v2: vendor CodeMirror 6 bundle (pinned, reproducible via BUILD.md)"
```

---

### Task 4: `editor.js` — language, theme, keymaps

**Files:**
- Create: `roadmap/editor.js`

**Interfaces:**
- Consumes: `./vendor/codemirror.js` (Task 3 exports), `STATUS_ALIASES` from `./parse.js`.
- Produces: `export function createEditor({parent, doc, onChange})` → `{view, getText(): string, setText(text), setHorizons(names: string[])}`. `onChange` fires (already debounce-free; app debounces) on every doc change. `setHorizons` reconfigures header highlighting when the model's horizon names change.

- [ ] **Step 1: Write editor.js**

```js
import {EditorState, Compartment, EditorView, keymap, drawSelection,
  highlightActiveLine, defaultKeymap, history, historyKeymap,
  StreamLanguage, syntaxHighlighting, HighlightStyle, tags as t}
  from './vendor/codemirror.js';
import {STATUS_ALIASES} from './parse.js';

function makeLang(horizons){
  const hset = new Set(horizons.map(h => h.toLowerCase()));
  return StreamLanguage.define({
    token(stream){
      if(stream.sol()){
        const line = stream.string.trim();
        if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
        if(/^(title|date|horizons|wip|fade)\s*:/i.test(line)){
          stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
        }
        if(hset.has(line.replace(/:$/, '').toLowerCase())){ stream.skipToEnd(); return 'heading'; }
        const lane = stream.match(/^\s*[^[\]:]+?:\s/, true);
        if(lane) return 'labelName';
      }
      if(stream.match(/^\[[^\]]+\]/)){
        const tag = stream.current().slice(1, -1).trim().toLowerCase();
        return STATUS_ALIASES[tag] ? 'atom' : 'invalid';
      }
      if(stream.match(/^\s--\s.*$/)) return 'meta';
      stream.next();
      return null;
    },
    languageData: {commentTokens: {line: '//'}},
  });
}

const highlightStyle = HighlightStyle.define([
  {tag: t.keyword, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.heading, fontWeight: '700'},
  {tag: t.labelName, color: 'var(--muted)', fontWeight: '600'},
  {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.invalid, color: 'var(--err)'},
  {tag: t.meta, color: 'var(--muted)'},
  {tag: t.comment, color: 'var(--muted)', opacity: '0.55'},
]);

const cmTheme = EditorView.theme({
  '&': {backgroundColor: 'var(--bg)', color: 'var(--ink)', fontSize: '13px',
    border: '1px solid var(--border)', borderRadius: '6px', minHeight: '440px'},
  '.cm-content': {fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    padding: '12px 0', lineHeight: '1.6', caretColor: 'var(--ink)'},
  '.cm-line': {padding: '0 12px'},
  '&.cm-focused': {outline: '2px solid var(--accent)', outlineOffset: '2px'},
  '.cm-activeLine': {backgroundColor: 'rgba(120,150,175,0.07)'},
  '.cm-cursor': {borderLeftColor: 'var(--ink)'},
  '&.cm-focused .cm-selectionBackground, ::selection':
    {backgroundColor: 'rgba(60,140,190,0.28)'},
});

export function createEditor({parent, doc, onChange}){
  const langComp = new Compartment();
  let currentHorizons = [];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        langComp.of(makeLang(['now', 'next', 'later'])),
        syntaxHighlighting(highlightStyle),
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => { if(u.docChanged) onChange(); }),
      ],
    }),
  });
  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: text => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}}),
    setHorizons(names){
      const key = names.join('|').toLowerCase();
      if(key === currentHorizons.join('|').toLowerCase()) return;
      currentHorizons = [...names];
      view.dispatch({effects: langComp.reconfigure(makeLang(names))});
    },
  };
}
```

(Alt+↑/↓ line move and Mod+/ comment toggle are part of `defaultKeymap` — verify in Task 5 Step 4 rather than adding custom bindings.)

- [ ] **Step 2: Commit**

```bash
git add roadmap/editor.js
git commit -m "roadmap v2: CodeMirror editor module with roadmap language and theme"
```

---

### Task 5: Assemble `index.html`, `style.css`, `app.js`, `edit.js` stub

**Files:**
- Create: `roadmap/index.html`, `roadmap/style.css`, `roadmap/app.js`, `roadmap/edit.js`

**Interfaces:**
- Consumes: `parse` (Task 1), `render` (Task 2), `createEditor` (Task 4).
- Produces: the working page at `roadmap/`; `edit.js` exports an empty placeholder (`export const EDIT_VERSION = 2;`) so the stage-3 module location exists.

- [ ] **Step 1: index.html + style.css**

`index.html`: copy `V1`'s full body markup (header, chips, editor card, importbox, preview card, actions incl. snapshot row, about, footer) inside the standard site wrapper (doctype/head pattern used by `fermi/index.html`, favicon 🗺️). Replace the `.editor` div's contents (`<pre id="hl">…` and `<textarea id="src">`) with a bare `<div id="cmhost"></div>`. Reference `<link rel="stylesheet" href="style.css">` and `<script type="module" src="app.js">`.

`style.css`: copy `V1`'s entire `<style>` block, then delete the now-dead rules: `#src`, `#hl`, `#hl .k/.h/.lane/.st-*/.note/.c`, and the `.editor` positioning block (keep a minimal `.editor{min-height:440px}` if needed — CodeMirror brings its own chrome via `cmTheme`).

- [ ] **Step 2: app.js**

Copy from `V1`, in order, adapting only as noted: `EXAMPLES`; snapshots (`loadSnaps`/`storeSnaps`/`renderSnapSel`/`normTitle`/`makeDiff`); saved roadmaps; `STATUS_FROM_LABEL` + `mdToDsl` + import wiring; exports (`svgString`/`download`/`slug`/`pngFrom` + button wiring); URL/localStorage boot. Imports at top:

```js
import {parse} from './parse.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
```

Adaptations (complete replacements, not sketches):

1. **DOM measure + colors live here now:**
```js
const measCtx = document.createElement('canvas').getContext('2d');
const measure = (text, font) => { measCtx.font = font; return measCtx.measureText(text).width; };
function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  return {card:g('--card'), border:g('--border'), ink:g('--ink'), muted:g('--muted'),
    accent:g('--accent'), bg:g('--bg'), err:g('--err'),
    status:{done:g('--st-done'), doing:g('--st-doing'), risk:g('--st-risk'), blocked:g('--st-blocked')}};
}
```

2. **Editor instance replaces `$('src')` reads** — every `$('src').value` becomes `editor.getText()`; every `$('src').value = x; refresh()` becomes `editor.setText(x)` (which triggers onChange → refresh). Delete the old `highlight()` function and scroll-sync listener entirely.

3. **Memoised diff + rAF refresh loop** (replaces v1 `refresh`/timers):
```js
let model = null, lastSvg = '', rafId = 0;
const snapModelCache = new Map();   // "idx|src-length|label" -> parsed model
function snapModel(idx){
  const sn = loadSnaps()[+idx];
  if(!sn) return null;
  const key = idx + '|' + sn.src.length + '|' + sn.label;
  if(!snapModelCache.has(key)) snapModelCache.set(key, parse(sn.src));
  return snapModelCache.get(key);
}
function makeDiff(model){            // v1 logic, but old model comes from the cache
  const idx = $('snapsel').value;
  if(idx === '') return null;
  const old = snapModel(idx);
  if(!old) return null;
  /* … rest identical to V1's makeDiff from `const oldMap` onward … */
}
function refresh(){
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(doRefresh);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  editor.setHorizons(model.horizons);
  renderWarnings(model);             // v1 warnings block, extracted to a function
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No items yet — add lines under a NOW / NEXT / LATER header.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = render(model, {colors: themeColors(), measure, diff: makeDiff(model)});
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  try{ localStorage.setItem('roadmap-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);   // v1 hash-encode block, extracted
}
let hashTimer = null, debTimer = null;
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange(){ clearTimeout(debTimer); debTimer = setTimeout(refresh, 120); },
});
```

4. **`svgString(slide)`** becomes `render(model, {colors: themeColors(), measure, diff: makeDiff(model), slide})`. Theme-change rerender: `lastSvg = ''` then `refresh()`.

5. **Boot** (hash > localStorage > empty) ends with `editor.setText(text)` — no manual `refresh()` needed when text is non-empty; call `refresh()` once explicitly for the empty case.

`edit.js`: `export const EDIT_VERSION = 2;` with a one-line comment pointing at the stage-3 spec section.

- [ ] **Step 3: Run the full test suite**

Run: `cd ~/repos/tools/roadmap && node --test tests/`
Expected: all pass (no app.js coverage — it's DOM; parity is Step 4).

- [ ] **Step 4: Manual parity check on a local server**

Run: `cd ~/repos/tools && python3 -m http.server 8087` then open `http://localhost:8087/roadmap/`.
Verify, per Global Constraints: examples load; typing feels immediate; highlighting correct for config/headers/lanes/statuses/notes/comments; Alt+↑/↓ moves lines; Cmd+/ toggles `//`; Cmd+Z works; snapshot → edit → compare shows badges without typing lag; markdown import round-trips; all three PNG/SVG exports download; URL round-trips (copy URL, open in new tab); dark + light themes render correctly.

- [ ] **Step 5: Commit**

```bash
git add roadmap/
git commit -m "roadmap v2 stage 1: modular app with CodeMirror editor and memoised refresh"
```

---

### Task 6: Landing page card + preview deploy + review gate

**Files:**
- Modify: `index.html` (site landing page — add the roadmap card to the `.tools` list and drop roadmap-as-code from the "In the workshop" line)

**Interfaces:**
- Consumes: the finished `roadmap/` app.

- [ ] **Step 1: Add landing card**

In the site `index.html`, after the `/rank/` card:

```html
<a class="tool" href="/roadmap/">
  <h2>Roadmap as code <span class="path">/roadmap</span></h2>
  <p>Write your roadmap as plain text; get a deck-ready now/next/later (or monthly/quarterly) graphic with snapshot-to-snapshot change tracking, SVG/PNG export, and zero box-nudging.</p>
  <span class="go">Open →</span>
</a>
```

And remove "roadmap-as-code, " from the `.soon` paragraph.

- [ ] **Step 2: Preview deploy for Matt**

```bash
cd ~/repos/tools && npx vercel deploy 2>&1 | grep -Eo 'https://[^ ]+vercel\.app' | head -1
```

Post the preview URL for Matt's review. **Gate: do not push to main / production until Matt approves the preview.**

- [ ] **Step 3: On approval — push (auto-deploys production)**

```bash
git add index.html && git commit -m "Landing: add roadmap-as-code card" && git push
```

Verify: `curl -s https://tools.matthewgarner.me/roadmap/ | grep -o '<title>[^<]*</title>'` → `<title>Roadmap as code</title>`.
