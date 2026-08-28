import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderBoard} from '../render.js';
import {betsDiff, betsDiffView} from '../diff.js';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e',
  bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5',
  status: {done: '#1d7a3e', doing: '#2b6cb0', risk: '#9a6a00', blocked: '#b3403a'},
  statusInk: {done: '#1c753c', doing: '#245e98', risk: '#8e6200', blocked: '#a83a34'}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };
const CTX = {colors: COLORS, measure};

const SRC = `title: Q3 portfolio
unit: £k
Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Sure loser: stake 100, odds 10-20%, payoff 50-80
Platform
  Billing rewrite: stake 200, odds 90-100%, payoff 250-350`;
const model = parse(SRC);
const sim = simulate(model);

test('board carries lane names, title, and every slip name', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /GROWTH/);
  assert.match(svg, /PLATFORM/);
  assert.match(svg, /Search revamp/);
  assert.match(svg, /Billing rewrite/);
});

test('header carries both named condition readings with P(loses money) and median outcome', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.equal([...svg.matchAll(/P\(LOSES MONEY\)/g)].length >= 2, true);
  assert.match(svg, /INDEPENDENT BASELINE/);
  assert.match(svg, /SHARED-OUTCOME STRESS/);
  assert.match(svg, /MEDIAN/);
  assert.doesNotMatch(svg, /NET EV/i);
});

test('unscored rows are explicit and cannot create a fake safe portfolio result', () => {
  const m = parse('G\n  Invalid: stake 20-10, odds 50%, payoff 30');
  const svg = renderBoard(m, simulate(m), CTX);
  assert.match(svg, /NOT SCORED/);
  assert.match(svg, /NOT AVAILABLE/);
  assert.match(svg, /NO SCOREABLE BETS/);
  assert.doesNotMatch(svg, /P\(LOSES MONEY\) 0%/);
});

test('condition readings survive the narrow relayout and accessible summary', () => {
  const svg = renderBoard(model, sim, {...CTX, width: 390});
  assert.match(svg, /data-condition="independent"/);
  assert.match(svg, /data-condition="shared"/);
  assert.match(svg, /<title id="bets-title">Q3 portfolio<\/title>/);
  assert.match(svg, /<desc id="bets-desc">Independent baseline:/);
});

test('audit badges render for known audits (loser + certainty + no-kill)', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /LOSES AT P50/);        // Sure loser
  assert.match(svg, /ODDS IMPLY CERTAINTY/); // Billing rewrite 90-100
  assert.match(svg, /NO KILL CRITERION/);
});

test('wide rows give every bet one protected exposure range and median notch', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.equal([...svg.matchAll(/data-exposure-range=""/g)].length, 3);
  assert.equal([...svg.matchAll(/data-exposure-median=""/g)].length, 3);
});

test('wide edit composition has one canonical card-menu row per bet source line', () => {
  const svg = renderBoard(model, sim, {...CTX, edit: true});
  for(const line of [4, 6, 8])
    assert.equal([...svg.matchAll(new RegExp('data-edit="cardmenu" data-line="' + line + '"', 'g'))].length, 1);
});

test('interactive SVG controls are siblings, never nested buttons', () => {
  const svg = renderBoard(model, sim, {...CTX, edit: true});
  let depth = 0;
  for(const token of svg.matchAll(/<g\b[^>]*>|<\/g>/g)){
    if(token[0] === '</g>'){ depth--; continue; }
    if(/role="button"/.test(token[0])){
      const close = svg.indexOf('</g>', token.index);
      assert.equal(/role="button"/.test(svg.slice(token.index + token[0].length, close)), false,
        'a button group contains another role=button');
    }
    depth++;
  }
  assert.equal(depth, 0);
});

test('more than eight bets renders an exhaustive full register in ledger mode', () => {
  const src = `Dense\n` + Array.from({length: 10}, (_, i) =>
    `  Bet ${i + 1}: stake ${i + 1}, odds 30-50%, payoff ${20 + i}-${40 + i}`).join('\n');
  const m = parse(src), s = simulate(m), svg = renderBoard(m, s, CTX);
  assert.match(svg, /PORTFOLIO LEDGER/);
  assert.match(svg, /FULL BET REGISTER · SOURCE ORDER/);
  assert.equal([...svg.matchAll(/data-row="bet"/g)].length, 10);
  for(let i = 1; i <= 10; i++) assert.ok(svg.includes('Bet ' + i));
});

test('edit hooks on stake / odds / payoff / kill with data-line', () => {
  const svg = renderBoard(model, sim, {...CTX, edit: true});
  assert.match(svg, /data-edit="stake" data-line="4"/);
  assert.match(svg, /data-edit="odds" data-line="4"/);
  assert.match(svg, /data-edit="payoff" data-line="4"/);
  assert.match(svg, /data-edit="kill" data-line="5"/);
});

/* ---- mobile-input stage: the edit-gated structure surface (ctx.edit) ---- */

test('edit:true narrow — name targets, per-group ＋ Add bet (group srcLine), one ＋ Add group', () => {
  const svg = renderBoard(model, sim, {...CTX, width: 390, edit: true});
  assert.match(svg, /data-edit="name" data-line="4" data-raw="Search revamp"/);
  assert.match(svg, /data-edit="name" data-line="8" data-raw="Billing rewrite"/);
  assert.match(svg, /data-edit="addbet" data-line="3"/);   // Growth's capsule
  assert.match(svg, /data-edit="addbet" data-line="7"/);   // Platform's capsule
  assert.equal([...svg.matchAll(/data-edit="addbet"/g)].length, 2, 'one capsule per group');
  assert.equal([...svg.matchAll(/data-edit="addgroup"/g)].length, 1, 'one add-group at the foot');
  assert.match(svg, /＋ Add bet/);
  assert.match(svg, /＋ Add group/);
});

test('edit:true narrow — the ＋ capsule hit band is ≥44px tall (coarse floor)', () => {
  const svg = renderBoard(model, sim, {...CTX, width: 390, edit: true});
  assert.match(svg, /data-edit="addbet"[\s\S]{0,600}?height="44"/);
  assert.match(svg, /data-edit="addgroup"[\s\S]{0,600}?height="44"/);
});

test('edit:true wide — the rename target exists too (the shared card menu routes to it); capsules stay narrow-only', () => {
  const svg = renderBoard(model, sim, {...CTX, edit: true});
  assert.match(svg, /data-edit="name" data-line="4" data-raw="Search revamp"/);
  assert.ok(!/data-edit="addbet"|data-edit="addgroup"/.test(svg), 'no capsules on the wide ledger');
});

test('edit gated OUT: without ctx.edit neither layout carries interactive markup', () => {
  for(const c of [CTX, {...CTX, width: 390}]){
    const svg = renderBoard(model, sim, c);
    assert.doesNotMatch(svg, /data-edit=|data-hit=|data-menu=|＋ Add/);
  }
});

test('edit:true — hostile group name is escaped in the ＋ Add bet aria-label', () => {
  const m = parse('G "quote" <x> &\n  B: stake 10, odds 20-40%, payoff 30-60');
  const svg = renderBoard(m, simulate(m), {...CTX, width: 390, edit: true});
  assert.ok(!svg.includes('<x>'), 'raw angle brackets never reach the markup');
  assert.match(svg, /&lt;x&gt;/);
});

test('hostile bet name is escaped', () => {
  const m = parse(`G\n  <img src=x onerror=alert(1)>: stake 10, odds 20-40%, payoff 30-60`);
  const svg = renderBoard(m, simulate(m), CTX);
  assert.ok(!svg.includes('<img'), 'no raw <img');
  assert.match(svg, /&lt;img/);
});

test('no NaN / undefined; well-formed shell; no bare data-edit attribute', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN/undefined');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.ok(!/ data-edit(?![=])/.test(svg), 'no bare data-edit');
});

test('degenerate all-point model does not NaN', () => {
  const m = parse(`G\n  Fixed: stake 10, odds 50-50%, payoff 100-100`);
  const svg = renderBoard(m, simulate(m), CTX);
  assert.ok(!/NaN/.test(svg));
});

test('narrow relayout (<520) emits the stacked layout and keeps edit hooks', () => {
  const svg = renderBoard(model, sim, {...CTX, width: 390, edit: true});
  assert.match(svg, /data-narrow=""/);
  assert.match(svg, /viewBox="0 0 390 /);
  assert.match(svg, /data-edit="odds"/);
  assert.match(svg, /data-menu=""/);      // slip-level card-menu hook for coarse pointers
});

test('concentration: >=40%-stake bet gets a named note on both layouts', () => {
  // fixture's Billing rewrite is 200 of 420 total stake = ~48%, so simulate()
  // names it as sim.concentration — confirm the board actually surfaces it
  assert.equal(sim.concentration.name, 'Billing rewrite');
  const pct = Math.round(sim.concentration.share * 100);
  const wide = renderBoard(model, sim, CTX);
  const narrow = renderBoard(model, sim, {...CTX, width: 390});
  for(const svg of [wide, narrow]){
    assert.match(svg, /Billing rewrite is 48% of total stake/);
    assert.ok(svg.includes(pct + '%'), 'note quotes the rounded share');
  }
});

test('concentration: no bet at 40%+ renders no note', () => {
  const flatSrc = `G\n  A: stake 25, odds 30-50%, payoff 40-90\n  B: stake 25, odds 30-50%, payoff 40-90\n  C: stake 25, odds 30-50%, payoff 40-90\n  D: stake 25, odds 30-50%, payoff 40-90`;
  const m = parse(flatSrc), s = simulate(m);
  assert.equal(s.concentration, null, 'fixture sanity: no bet reaches 40%');
  const wide = renderBoard(m, s, CTX);
  const narrow = renderBoard(m, s, {...CTX, width: 390});
  for(const svg of [wide, narrow]){
    assert.ok(!/carries the book/.test(svg), 'no concentration line when null');
    assert.ok(!/⚑/.test(svg), 'no flag glyph when null');
  }
});

/* ---------------- snapshot compare ---------------- */
// SRC (parsed as `model`/simulated as `sim` above) plays the SNAPSHOT; CUR_SRC
// is the current portfolio after one edit of each kind: "Sure loser" killed,
// "Fresh angle" added, "Billing rewrite"'s odds moved 90-100% -> 70-85%.
const CUR_SRC = `title: Q3 portfolio
unit: £k
Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Fresh angle: stake 50, odds 20-40%, payoff 80-150
Platform
  Billing rewrite: stake 200, odds 70-85%, payoff 250-350`;
const curModel = parse(CUR_SRC);
const curSim = simulate(curModel);
const compareView = betsDiffView(betsDiff(model, curModel), '2026-06-01');
const compareCtx = {...CTX, compare: {...compareView, prevSim: sim}};

test('compare: headline counts 1 new / 1 killed / odds moved on 1', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.match(svg, /Since 2026-06-01: 1 new · 1 killed · odds moved on 1\./);
});

test('compare: NEW marker on the added bet', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.match(svg, />NEW</);
  assert.match(svg, /Fresh angle/);
});

// The NEW pill's x must track the first name line's measured width, clamped to
// C.nameEnd - 40 (322 - 40 = 282) so it never collides with a wrapped long name —
// and hugs a short name's end rather than sitting at a fixed offset that overlaps it.
const NEW_PILL_RE = /<rect x="([\d.]+)"[^>]*fill-opacity="0.1"[^>]*\/><text[^>]*>NEW<\/text>/;

test('compare: NEW pill hugs the end of a short, unwrapped first name line', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  const m = NEW_PILL_RE.exec(svg);
  assert.ok(m, 'NEW pill rect found');
  // "Fresh angle" (11 chars) under the test measure (13px * 0.55/char = 7.15/char):
  // C.name(84) + 11*7.15(78.65) + 8 = 170.65 — nowhere near the 282 clamp.
  assert.equal(m[1], '170.65');
});

test('compare: NEW pill clamps clear of a long wrapping first name line', () => {
  const wrapSrc = `title: Q3 portfolio
unit: £k
Growth
  Overinvesting in legacy billing integration rework: stake 50, odds 20-40%, payoff 80-150
Platform
  Billing rewrite: stake 200, odds 90-100%, payoff 250-350`;
  const wrapModel = parse(wrapSrc);
  const wrapSim = simulate(wrapModel);
  const wrapCompare = betsDiffView(betsDiff(model, wrapModel), '2026-06-01');
  const svg = renderBoard(wrapModel, wrapSim, {...CTX, compare: {...wrapCompare, prevSim: sim}});
  const m = NEW_PILL_RE.exec(svg);
  assert.ok(m, 'NEW pill rect found');
  // first line wraps to "Overinvesting in legacy billing" (31 chars * 7.15 = 221.65);
  // C.name(84) + 221.65 + 8 = 313.65, clamped down to C.nameEnd - 40 (282).
  assert.equal(m[1], '282');
});

test('compare: KILLED ghost row for the dropped bet, in its lane', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.match(svg, />KILLED</);
  assert.match(svg, /Sure loser/);   // struck, but the name still reads
});

test('compare: moved odds show "was <old odds>"', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.ok(svg.includes('was 90–100%'), 'old odds value shown as a "was" note');
});

test('compare: ghost portfolio band draws the snapshot P10-P90', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.match(svg, /SNAPSHOT P10.P90/);
});

test('compare: narrow layout carries the same headline + NEW + KILLED markers', () => {
  const svg = renderBoard(curModel, curSim, {...compareCtx, width: 390});
  assert.match(svg, /Since 2026-06-01: 1 new · 1 killed · odds moved on 1\./);
  assert.match(svg, />NEW</);
  assert.match(svg, />KILLED</);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN/undefined in narrow compare');
});

test('compare: well-formed, no NaN/undefined in the wide compare render', () => {
  const svg = renderBoard(curModel, curSim, compareCtx);
  assert.ok(!/NaN|undefined/.test(svg));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.ok(!/ data-edit(?![=])/.test(svg), 'no bare data-edit');
});

test('compare absent: no NEW/KILLED/Since leakage, board unchanged', () => {
  const svgWide = renderBoard(curModel, curSim, CTX);
  const svgNarrow = renderBoard(curModel, curSim, {...CTX, width: 390});
  for(const svg of [svgWide, svgNarrow]){
    assert.ok(!/Since /.test(svg), 'no compare headline without ctx.compare');
    assert.ok(!/>NEW</.test(svg), 'no NEW marker without ctx.compare');
    assert.ok(!/>KILLED</.test(svg), 'no KILLED marker without ctx.compare');
    assert.ok(!/SNAPSHOT P10/.test(svg), 'no ghost band without ctx.compare');
  }
});
