import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {render, treeVerdictParts} from '../render.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c',
    bg:'#f7f8f6', err:'#b33', brandText:'#D62015'},
  measure: t => t.length * 7,
  ...extra,
});
const BID = 'title: Bid decision\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';

test('well-formed svg, no NaN, verdict present', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx());
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('VERDICT'));                 // 6b kicker, literal uppercase
  assert.ok(svg.includes('Choose Bid'));              // the recommended option leads the display line
  assert.ok(svg.includes('% of simulations'));
});

/* ---- Swiss 6b: the display verdict + its one key figure ---- */

test('treeVerdictParts: the line names the recommended option and ends with its EV figure', () => {
  const m = parse(BID);
  const {line, fig} = treeVerdictParts(m, evaluate(m));
  assert.match(fig, /^£[\d.]+[kM]?$/, 'figure is the EV money string, got ' + fig);
  assert.equal(line, 'Choose Bid — expected value ' + fig);
  assert.ok(line.endsWith(fig), 'the figure is the last token — a wrap can never split it');
  assert.equal(line.indexOf(fig), line.lastIndexOf(fig), 'the figure appears exactly once');
});

test('treeVerdictParts: no verdict without a decision root', () => {
  const chanceOnly = parse('Weather\n  Sunny (p=0.7): 10\n  Rain (p=rest): -5');
  assert.deepEqual(treeVerdictParts(chanceOnly, evaluate(chanceOnly)), {line: '', fig: ''});
});

test('6b: exactly one brand tspan (the key figure), and the EV is not printed twice', () => {
  const m = parse(BID);
  const r = evaluate(m);
  const svg = render(m, r, ctx());
  const {fig} = treeVerdictParts(m, r);
  assert.equal((svg.match(/fill="#D62015"/g) || []).length, 1, 'one brand-coloured run in the whole artefact');
  assert.ok(svg.includes(">" + fig + "</tspan>"), 'the brand run IS the figure');
  assert.ok(!svg.includes('EV ' + fig), 'the evidence line drops EV — the display line carries it');
  assert.ok(svg.includes('P10 ') && svg.includes('P90 '), 'evidence line still supports the verdict');
});

test('6b: the verdict band height is content-driven — a long option pushes the tree down', () => {
  const short = parse(BID);
  const longLabel = parse(BID.replace('Bid: -150k',
    'Bid for the Acme framework contract with the incumbent supplier alongside us and a partner ' +
    'consortium covering the northern region: -150k'));
  const hOf = svg => +svg.match(/height="(\d+)"/)[1];
  const yOfFirstNode = svg => +svg.match(/<rect x="[\d.]+" y="([\d.]+)" width="14"/)[1];
  const a = render(short, evaluate(short), ctx()), b = render(longLabel, evaluate(longLabel), ctx());
  assert.ok(hOf(b) > hOf(a), 'a wrapped verdict makes the artefact taller');
  assert.ok(yOfFirstNode(b) > yOfFirstNode(a), 'and pushes the tree below it — never a collision');
});

test('policy path uses scheme accent; rejected branch fades', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('#1F4FD8'), 'ocean scheme accent on policy path (light)');
  assert.ok(svg.includes('opacity="0.42"'), 'rejected option faded');
});

test('money formatting: currency symbol, minus before symbol', () => {
  const m = parse('currency: $\nRoot\n  A: -150k\n    Out\n      W (p=0.5): 1M\n      L (p=rest): 0\n  B: 0');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('−$150k'));
  assert.ok(!svg.includes('$-'));
});

test('flip section renders', () => {
  const m = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.6): 2M\n      Lose (p=rest): 0\n  No bid: 0');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('WHAT WOULD FLIP THIS'));
  assert.ok(svg.includes('flips if p(Win) &lt; 0.08') || svg.includes('flips if p(Win) &lt; 0.07'));
});

test('escaping in labels', () => {
  const m = parse('Root\n  A & B <opt>: 10\n  C: 5');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('A &amp; B &lt;opt&gt;'));
});

test('slide mode scales wider; chance-only tree has no verdict', () => {
  const m = parse(BID);
  const r = evaluate(m);
  const wOf = svg => +svg.match(/width="(\d+)"/)[1];
  assert.ok(wOf(render(m, r, ctx({slide: true}))) > wOf(render(m, r, ctx())));
  const chanceOnly = parse('Weather\n  Sunny (p=0.7): 10\n  Rain (p=rest): -5');
  const svg2 = render(chanceOnly, evaluate(chanceOnly), ctx());
  assert.ok(!svg2.includes('VERDICT'));
});

test('edit-in-place targets: tspans carry kind, line and raw source', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.ok(svg.includes('data-edit="prob"') && svg.includes('data-raw="0.3-0.45"'));
  assert.ok(svg.includes('data-edit="value"') && svg.includes('data-raw="2M to 5M"'));
  assert.ok(svg.includes('data-edit="label"'));
});

test('native SVG export strips every live edit and keyboard-focus hook', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx({intent: 'native', edit: true}));
  for(const token of ['data-edit=', 'data-menu=', 'data-hit=', 'data-raw=', 'tabindex=', 'role="button"']){
    assert.ok(!svg.includes(token), 'native SVG must omit ' + token);
  }
});

test('presentation export strips every live edit and keyboard-focus hook', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx({intent: 'presentation', edit: true}));
  for(const token of ['data-edit=', 'data-menu=', 'data-hit=', 'data-raw=', 'tabindex=', 'role="button"']){
    assert.ok(!svg.includes(token), 'presentation SVG must omit ' + token);
  }
});

test('chance children are possible outcomes, never chosen outcomes', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx({intent: 'presentation'}));
  assert.equal((svg.match(/POSSIBLE OUTCOME/g) || []).length, 2);
  assert.ok(!svg.includes('CHOSEN OUTCOME'));
});

test('zero-effective-probability chance children are explicitly excluded', () => {
  const m = parse('Root\n  Risk\n    Certain (p=1): 10\n    Impossible (p=rest): 999\n  Safe: 0');
  const svg = render(m, evaluate(m), ctx({intent: 'presentation'}));
  assert.ok(svg.includes('EXCLUDED · ZERO PROBABILITY'));
  assert.equal((svg.match(/POSSIBLE OUTCOME/g) || []).length, 1);
});

test('hero evidence compares the recommendation with its closest EV competitor', () => {
  const m = parse('Root\n  Distant: 0\n  Closest: 90\n  Recommend: 100');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('beats Closest in'));
  assert.ok(!svg.includes('beats Distant in'));
});

test('card menus expose a dependable 44px SVG hit target', () => {
  const m = parse(BID);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.match(svg, /data-menu=""[\s\S]*data-hit=""[^>]*width="44"[^>]*height="44"[^>]*pointer-events="all"/);
});

/* B2: the priced-insistence walk's crossfade/hot-mark hooks. Doc has no
   title: line so srcLine matches the plan's canonical numbers directly —
   line 0 Root, line 1 Bid (root option), line 3 Win (the hot prob+value). */
const BID_NO_TITLE = 'Root\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';

test('B2: ctx.hot marks the named prob/value tspans data-hot="" (edit + hot only)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true, hot: new Set(['prob:3', 'value:3'])}));
  assert.ok(svg.includes('data-hot=""'), 'bare data-hot="" attribute present');
  // both the Win probability tspan and the Win payoff tspan (line 3) are marked
  assert.equal((svg.match(/data-hot=""/g) || []).length, 2, 'both prob and value tspans on line 3 marked');
  assert.ok(/<line[^>]*stroke-dasharray/.test(svg), 'a dotted underline is drawn under the marked run(s)');
});

test('B2: root-child subtrees get data-opt="<srcLine>" (edit-gated crossfade addressing)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.ok(svg.includes('data-opt="1"'), 'Bid (root option, line 1) addressable');
  assert.ok(svg.includes('data-opt="5"'), 'No bid (root option, line 5) addressable');
});

test('B2: MC readouts stamped data-mc="" and the verdict band wrapped data-verdict="" (edit-gated)', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({edit: true}));
  assert.ok(svg.includes('data-mc=""'));
  assert.ok(svg.includes('data-verdict=""'));
});

test('B2: golden-safety — none of the edit-only marks appear when edit is falsy', () => {
  const m = parse(BID_NO_TITLE);
  const svg = render(m, evaluate(m), ctx({hot: new Set(['prob:3', 'value:3'])}));   // hot present, edit absent
  assert.ok(!svg.includes('data-hot'));
  assert.ok(!svg.includes('data-opt'));
  assert.ok(!svg.includes('data-mc'));
  assert.ok(!svg.includes('data-verdict'));
});

/* ---------- `verdict:` on the artefact (2026-07-31) ---------- */
test('verdict: off drops the whole band — kicker, line and the tool\'s evidence sentence', () => {
  const m = parse('verdict: off\n' + BID);
  const svg = render(m, evaluate(m), ctx());
  assert.ok(!svg.includes('VERDICT'));
  assert.ok(!svg.includes('Choose Bid'));
  assert.ok(!svg.includes('% of simulations'));       // the muted evidence goes with its line
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
});

test('verdict: <text> replaces the line AND the tool\'s evidence — a claim of yours is not propped up by a sentence of ours', () => {
  const m = parse('verdict: We bid, and we bid high\n' + BID);
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('VERDICT'));                 // the anatomy stays
  assert.ok(svg.includes('We bid, and we bid high'));
  assert.ok(!svg.includes('Choose Bid'));
  assert.ok(!svg.includes('% of simulations'));
});

test('verdict: an authored line still carries ONE brand figure, derived from its own text', () => {
  const m = parse('verdict: 3 of 5 outcomes lose money\n' + BID);
  const parts = treeVerdictParts(m, evaluate(m));
  assert.equal(parts.line, '3 of 5 outcomes lose money');
  assert.equal(parts.fig, '3');
});

test('verdict: an authored line survives a tree with no decision root, where the tool has nothing to say', () => {
  const m = parse('verdict: Nothing to choose here yet\nOutcome\n  Win (p=0.5): 10\n  Lose (p=rest): 0');
  assert.equal(treeVerdictParts(m, evaluate(m)).line, 'Nothing to choose here yet');
});

const DENSE = `title: Long-range launch decision
Decision
  Commit to the comprehensive partner-led launch with a deliberately long descriptive name: -250k
    Commercial response
      Strong adoption across the first customer cohort (p=0.3): 2M to 4M
      Useful signal but material rework remains (p=0.4): 300k to 900k
      Weak demand and an expensive retreat (p=rest): -1M to -400k
  Run a carefully bounded pilot before making the full commitment: -80k
    Evidence gate
      Customer evidence
        Clear pull from the intended audience (p=0.55): 900k to 1.4M
        Ambiguous signal requiring another round (p=rest): -180k to 120k
  Hold the current course and revisit after the planning window: 0`;

test('dense native output carries the exhaustive decision register', () => {
  const m=parse(DENSE),svg=render(m,evaluate(m),ctx({intent:'native'}));
  assert.ok(svg.includes('OPTIONS REGISTER · FULL MODEL'));
  for(const label of ['PROBABILITY','PAYOFF','EXPECTED VALUE','POLICY STATUS']) assert.ok(svg.includes(label));
  assert.ok(svg.includes('Commit to the comprehensive') && svg.includes('partner-led launch'));
  assert.ok(!svg.includes('NaN'));
});

test('edit chrome leaves geometry unchanged and register mirrors stay read-only', () => {
  const m=parse(DENSE),results=evaluate(m),plain=render(m,results,ctx({intent:'native'})),edited=render(m,results,ctx({intent:'native',edit:true}));
  const dims=svg=>svg.match(/^<svg[^>]*width="([\d.]+)" height="([\d.]+)"/).slice(1);
  assert.deepEqual(dims(edited),dims(plain));
  const mirrors=[...edited.matchAll(/<g data-register-row="[^"]+" data-mirror="">([\s\S]*?)<\/g>/g)].map(x=>x[1]);
  assert.ok(mirrors.length && mirrors.every(x=>!x.includes('data-edit=')));
});

test('every authored line has one canonical editable label in wide and narrow', () => {
  const m=parse(DENSE),results=evaluate(m),nodes=[];
  (function walk(node){if(!node.implicit)nodes.push(node);node.children.forEach(walk);})(m.root);
  for(const extra of [{intent:'live-wide'},{intent:'live-narrow',width:390}]){
    const svg=render(m,results,ctx({...extra,edit:true}));
    nodes.forEach(node=>assert.equal((svg.match(new RegExp('data-edit="label" data-line="'+node.srcLine+'"','g'))||[]).length,1,extra.intent+' line '+node.srcLine));
  }
});

test('phone is a memo and Copy PNG is a labelled policy-path slide', () => {
  const m=parse(DENSE),results=evaluate(m),phone=render(m,results,ctx({intent:'live-narrow',width:390}));
  assert.match(phone,/width="390"/); assert.ok(phone.includes('data-memo-row')&&phone.includes('RECOMMENDED PATH')); assert.ok(!phone.includes('data-tree-edge'));
  const slide=render(m,results,ctx({intent:'presentation'}));
  assert.match(slide,/^<svg[^>]*width="1920" height="1080"/); assert.ok(slide.includes('RECOMMENDED POLICY PATH')&&slide.includes('SELECTION: POLICY PATH')&&slide.includes('FULL SVG'));
});
