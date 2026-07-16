/* Meta-test: the PHONE edit surface (mobile-input Stage 0 gate).

   The trap this closes: timeline shipped a narrow relayout that emits ZERO
   edit-in-place targets, so on a phone the whole "tap the diagram to edit"
   paradigm silently vanished — and nothing failed. Here, every tool that
   wires attachEditInPlace is rendered at phone width THE WAY ITS APP DOES
   (same render fn, same ctx/opts shape, width 390 only where the app passes
   one), and the edit surface is asserted against a per-tool floor:

   - kinds: at least this many DISTINCT data-edit kinds (>= — a ratchet
     against regression, raised as the mobile-input paradigm rolls out);
   - menu: where true, the artefact must carry data-menu (the coarse-pointer
     card-menu entry point in assets/edit-in-place.js);
   - pilot: a KNOWN GAP, asserted with === so the moment the tool gains a
     phone edit surface this test FAILS and the floor must be raised — an
     honest ratchet, not a vacuous >=0 pass.

   The tool list is DISCOVERED (app.js files importing attachEditInPlace,
   same self-enforcing pattern as renderer-coverage), and FLOORS must cover
   exactly that set — a new edit-in-place tool fails here until it declares
   its phone floor. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const W = 390;   // iPhone-class CSS width; below the 520px narrow bucket

/* Same ctx shape as dev/injection.test.mjs — the renderers only read colours,
   measure and today from it. */
const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', accent2: '#c05621', bg: '#f7f8f6', err: '#b3403a', track: '#edf0ee',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
    statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'}, accentInk: '#0A6C94'},
  measure: t => t.length * 7, today: 20650, dark: false,
};

/* ---- discovery: which tools wire edit-in-place? ---- */
function eipTools(){
  const out = [];
  const check = rel => {
    const p = join(ROOT, rel, 'app.js');
    if(existsSync(p) && readFileSync(p, 'utf8').includes('attachEditInPlace')) out.push(rel);
  };
  for(const top of readdirSync(ROOT)){
    if(top.startsWith('.') || top === 'node_modules' || !statSync(join(ROOT, top)).isDirectory()) continue;
    check(top);
    if(top === 'energy')
      for(const sub of readdirSync(join(ROOT, top)))
        if(statSync(join(ROOT, top, sub)).isDirectory()) check(top + '/' + sub);
  }
  return out.sort();
}

/* ---- per-tool floors (measured 2026-07-16, the Stage 0 baseline) ---- */
const FLOORS = {
  roadmap:   {kinds: 5, menu: true},
  why:       {kinds: 7, menu: true},
  tree:      {kinds: 7, menu: true},
  map:       {kinds: 6, menu: true},
  /* bets (mobile-input stage, 2026-07-16): the narrow board's structure surface
     landed — name (rename) + addbet/addgroup capsules join the unconditional
     stake/odds/payoff/kill cells and the per-card data-menu: 8 distinct kinds. */
  bets:      {kinds: 8, menu: true},
  /* wardley's tap menu is its own componentmenu KIND (an actions popover),
     not the data-menu redirect attribute — menu:false is accurate, not a gap */
  wardley:   {kinds: 4, menu: false},
  /* cycles/risk: the num capsules survive the narrow relayout — 1 kind is the
     whole (real) surface */
  'energy/cycles': {kinds: 1, menu: false},
  'energy/risk':   {kinds: 1, menu: false},
  /* THE PILOT, LANDED: timeline's narrow relayout is now fully phone-editable —
     every milestone row is a data-menu cardmenu whose ＋ Add capsules + field/
     routing targets emit 7 distinct kinds (additem, cardmenu, dates, label, note,
     setlane, status). The floor ratchets up here; menu:true asserts the card-menu
     entry point survives. */
  timeline:  {kinds: 7, menu: true},
};

/* ---- house-example docs (trimmed from each tool's first example chip) ---- */
const DOCS = {
  roadmap: 'title: Habitat — Product Roadmap\nhorizons: Now, Next, Later\n\nNOW\nCore: Streak freeze [doing] -- the top-requested fix\nGrowth: Referral flow [risk]\n\nNEXT\nCore: Smart reminders',
  timeline: 'title: Habitat 2.0 — launch programme\nApp: Feature freeze 2026-08-14 .. 2026-08-28\nApp: Store review passed 2026-10 .. 2026-11 [risk] // review times vary\nMarketing: Landing page live 2026-08-21 [done]\nLaunch day 2026-11 .. 2027-01',
  why: 'title: Q3 — 90-day retention\noutcome: Improve 90-day retention\n\n  Users forget mid-afternoon habits\n    Smart reminders [testing]\n      ? users want to be interrupted at work [testing]\n    Streak freeze [delivering]',
  tree: 'title: Bid for the Acme contract\ncurrency: £\n\nBid decision\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0',
  map: 'preset: assumptions\ntitle: Habitat — launch assumptions\n\nUsers will log habits daily @ 30,90 :: test: watch 5 onboarding sessions\nStreak anxiety drives churn @ 75,80 :: note: held in Q2 interviews\nLegal sign-off on health claims',
  bets: 'title: Habitat — Q3 bet portfolio\nunit: £k\n\nGrowth bets\n  Referral flow v2: stake 80, odds 40-60%, payoff 300-500\n    kill: Signups per referral stay under 0.3 by 2026-09-15\n  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300',
  wardley: 'title: Habitat platform\nanchor: Habit tracking\n\nHabit builder @ product\nStreak engine @ custom\nUser DB @ commodity\n\nHabit tracking -> Habit builder -> Streak engine -> User DB',
  'energy/cycles': 'title: Cycle budget — Wexcombe 100MW/2h\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%',
  'energy/risk': 'title: Route to market — Wexcombe 100MW/2h\nmerchant: 60..180\n\nfloor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30',
};

/* ---- drivers: each mirrors ITS app's live-preview render call at phone width ---- */
const DRIVERS = {
  async roadmap(doc){
    const {parse} = await import('../roadmap/parse.js');
    const {render} = await import('../roadmap/render.js');
    return render(parse(doc), {...ctx, edit: true, width: W});
  },
  async timeline(doc){
    const {parse} = await import('../timeline/parse.js');
    const {render} = await import('../timeline/render.js');
    return render(parse(doc), {...ctx, width: W}, null, {edit: true});
  },
  async why(doc){
    const {parse} = await import('../why/parse.js');
    const {project} = await import('../why/project.js');
    const {renderOst} = await import('../why/render-ost.js');
    const m = parse(doc);
    return renderOst(m, project(m), {...ctx, edit: true, width: W});
  },
  async tree(doc){   // tree has no narrow relayout: wide artefact pans, edit markup intact
    const {parse} = await import('../tree/parse.js');
    const {evaluate} = await import('../tree/engine.js');
    const {render} = await import('../tree/render.js');
    const m = parse(doc);
    return render(m, evaluate(m), {...ctx, edit: true});
  },
  async map(doc){    // map has no narrow relayout either
    const {parse} = await import('../map/parse.js');
    const {resolve} = await import('../map/zones.js');
    const {readout} = await import('../map/readout.js');
    const {render} = await import('../map/render.js');
    const m = parse(doc), r = resolve(m);
    return render(m, r, readout(m, r), {...ctx, edit: true});
  },
  async bets(doc){   // value cells are unconditional; ctx.edit gates the structure surface
    const {parse} = await import('../bets/parse.js');
    const {simulate} = await import('../bets/engine.js');
    const {renderBoard} = await import('../bets/render.js');
    const m = parse(doc);
    return renderBoard(m, simulate(m), {...ctx, edit: true, width: W});
  },
  async wardley(doc){
    const {parse} = await import('../wardley/parse.js');
    const {layoutMap} = await import('../wardley/layout.js');
    const {renderMap} = await import('../wardley/render.js');
    const m = parse(doc);
    return renderMap(m, layoutMap(m),
      {...ctx, palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8'], width: W}, {edit: true});
  },
  async 'energy/cycles'(doc){
    const {parse} = await import('../energy/cycles/parse.js');
    const {simulate} = await import('../energy/cycles/engine.js');
    const {render} = await import('../energy/cycles/render.js');
    const m = parse(doc);
    return render(m, simulate(m, {seed: 1, n: 500}), {...ctx, width: W}, {edit: true});
  },
  async 'energy/risk'(doc){
    const {parse} = await import('../energy/risk/parse.js');
    const {simulate} = await import('../energy/risk/engine.js');
    const {render} = await import('../energy/risk/render.js');
    const m = parse(doc);
    return render(m, simulate(m), {...ctx, width: W}, {edit: true, focus: null});
  },
};

const editKinds = svg => new Set([...svg.matchAll(/data-edit=["']([^"']+)["']/g)].map(m => m[1]));

test('every edit-in-place tool has a declared phone-edit floor (and no stale entries)', () => {
  const tools = eipTools();
  assert.ok(tools.length >= 9, 'discovery collapsed — found only: ' + tools.join(', '));
  assert.deepEqual(tools, Object.keys(FLOORS).sort(),
    'FLOORS must cover exactly the attachEditInPlace tools — new tool without a phone floor, or stale entry');
  assert.deepEqual(tools, Object.keys(DRIVERS).sort(), 'DRIVERS out of step with the discovered tool set');
  assert.deepEqual(tools, Object.keys(DOCS).sort(), 'DOCS out of step with the discovered tool set');
});

for(const [tool, floor] of Object.entries(FLOORS)){
  test('phone edit surface: ' + tool + (floor.pilot ? ' [KNOWN GAP — pilot target]' : ''), async () => {
    const svg = await DRIVERS[tool](DOCS[tool]);
    const kinds = editKinds(svg);
    if(floor.pilot){
      assert.equal(kinds.size, floor.kinds,
        tool + ' now emits ' + kinds.size + ' edit kind(s) at phone width (' + [...kinds].join(', ') +
        ') — the pilot landed: RAISE this floor to the real number and drop the pilot marker. (' + floor.pilot + ')');
      return;
    }
    assert.ok(kinds.size >= floor.kinds,
      tool + ' phone edit surface regressed: ' + kinds.size + ' distinct data-edit kinds (' +
      [...kinds].join(', ') + '), floor is ' + floor.kinds);
    if(floor.menu) assert.ok(/data-menu/.test(svg),
      tool + ' lost its data-menu card-menu entry point at phone width');
  });
}
