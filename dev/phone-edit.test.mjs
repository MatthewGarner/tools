import {renderChapter as render} from '../roadmap/chapter-svg.js';
/* Meta-test: the PHONE edit surface (mobile-input Stage 0 gate).

   The trap this closes: timeline shipped a narrow relayout that emits ZERO
   edit-in-place targets, so on a phone the whole "tap the diagram to edit"
   paradigm silently vanished — and nothing failed. Here, every tool that
   wires attachEditInPlace is rendered at phone width THE WAY ITS APP DOES
   (same render fn, same ctx/opts shape, width 390 only where the app passes
   one), and the edit surface is asserted against a per-tool floor:

   - kinds: at least this many DISTINCT data-edit kinds (>= — a ratchet
     against regression, raised as the mobile-input paradigm rolls out).
     EVERY FLOOR SITS AT ITS MEASURED VALUE. A `>=` floor with slack is not a
     ratchet: six of these carried 1-2 kinds of headroom (measured 2026-08-16),
     so timeline could silently lose TWO whole edit kinds and still pass. When
     a tool gains a kind, raise its floor in the same commit;
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

/* ---- per-tool floors (baselined 2026-07-16; seven re-measured 2026-08-16) ---- */
const FLOORS = {
  roadmap:   {kinds: 6, menu: true},
  why:       {kinds: 7, menu: true},
  /* Tree's live-narrow coarse surface deliberately removes the three tiny
     inline field kinds. Its root/decision/chance/leaf menus plus verdict
     remain, and each menu carries field-specific raw values for its rows. */
  tree:      {kinds: 6, menu: true},
  /* Map's Zone Atlas deliberately replaces the legacy inventory of visible
     field/remove controls with a source-order placement audit. Its exact phone
     contract lives below: a compact position field, one menu plane per source
     item, and the authored field route carried by that menu. */
  map:       {menu: true, field: true},
  /* bets (mobile-input stage, 2026-07-16): the narrow board's structure surface
     landed — name (rename) + addbet/addgroup capsules join the unconditional
     stake/odds/payoff/kill cells and the per-card data-menu: 8 distinct kinds. */
  bets:      {kinds: 8, menu: true},
  /* wardley's tap menu is its own componentmenu KIND (a card menu: Needs…
     edge-toggle submenu + Remove), not the data-menu redirect attribute —
     menu:false is accurate, not a gap. The Needs… rows (mobile-input stage,
     2026-07-16) are menu rows built from the model in app.js, not data-edit
     targets. At this width the set measures additem, anchor, componentmenu, name,
     plus verdict and verdictedit from verdict EIP (2026-08-02) — six; the
     Needs… behaviour is gated in dev/pw/check-eip.mjs. */
  wardley:   {kinds: 6, menu: false},
  /* cycles (mobile-input tail, 2026-07-17): the num pills stay directly editable
     AND each band gains a top-right ⋯ card menu (data-menu cardmenu) exposing the
     optional-key structure — add/remove charge/second/drift/discount/augment. The
     DOC below is the all-keys example (no ghost band), so the addkey capsule kind
     only shows when an optional band is absent — the floor is num + cardmenu = 2. */
  'energy/cycles': {kinds: 2, menu: true},
  /* risk (mobile-input tail, 2026-07-17): num pills + a per-structure ⋯ card menu
     (data-menu cardmenu: Rename / insure limit add-remove / Remove) + the title
     Rename `label` target + the ＋ Add structure `addleg` picker = 4 distinct
     kinds (addleg, cardmenu, label, num). Merchant stays a plain baseline row. */
  'energy/risk':   {kinds: 4, menu: true},
  /* THE PILOT, LANDED: timeline's narrow relayout is now fully phone-editable —
     every milestone row is a data-menu cardmenu whose ＋ Add capsules + field/
     routing targets emit additem, cardmenu, dates, label, note, setlane and status,
     plus verdict and verdictedit from verdict EIP (2026-08-02) — nine. The floor
     ratchets up here; menu:true asserts the card-menu entry point survives. */
  timeline:  {kinds: 9, menu: true},
  /* gauge (mobile-input tail, LAST stage, 2026-07-17): the compose FORM is HTML,
     not an SVG diagram — attachEditInPlace is surface-agnostic, so the participant
     form gains authoring chrome: qtext/qtype/removeq per head, unit on ranges,
     opt/rmopt/addopt on chips, and a doc-level addq picker = 8 distinct kinds.
     No per-card ⋯ menu (menu:false) — every edit has a direct visible affordance,
     so a data-menu redirect would be pure indirection (the wardley precedent).
     The DOC below carries all three types (3-option chips so rmopt renders, a
     unit'd range) so every kind is exercised. */
  gauge:     {kinds: 8, menu: false},
  /* paths (decision inspector, 2026-08-11): narrow SVG questions select a real
     topology question, then the HTML receipt exposes a FIXED ten-field
     contract — the same ten whichever decision is selected and whatever is set.
     The driver selects `groups` from treeProjection before serialising the exact
     field contract app.js consumes; a static page shell cannot satisfy this. */
  paths:     {kinds: 10, menu: false},
  /* Proxy's one source edit is the hunt-level author-stated verdict. It lives
     in stage chrome rather than the explanatory SVG, so smoke.mjs exercises
     the real menu; this keeps that phone surface in the shared floor registry. */
  proxy:     {kinds: 1, menu: false},
};

/* ---- house-example docs ----
   Purpose-built to exercise each tool's edit kinds at phone width, NOT a
   faithful copy of its example: several are paraphrases (timeline's title,
   case's link, gauge's spliced chips question) and proxy's entry is never read
   at all — DRIVERS.proxy reads proxy/index.html, and the entry exists only to
   satisfy the DOCS/FLOORS parity check. The header used to claim these were
   "trimmed from each tool's first example chip"; roadmap's had silently drifted
   from that claim and cost real coverage, so the claim is retired rather than
   restated. Every kind count here is measured against the tool's REAL first
   example too — they agree. */
const DOCS = {
  roadmap: 'title: Lantern — Product Roadmap\nheadline: Retention first — everything in Now keeps readers reading\nhorizons: Now, Next, Later\n\nNOW\nCore: Resume where you left off [doing] -- the top-requested fix\nGrowth: Referral flow [risk]\n\nNEXT\nCore: Reading reminders',
  timeline: 'title: Lantern 2.0 — launch programme\nApp: Feature freeze 2026-08-14 .. 2026-08-28\nApp: Store review passed 2026-10 .. 2026-11 [risk] // review times vary\nMarketing: Landing page live 2026-08-21 [done]\nLaunch day 2026-11 .. 2027-01',
  why: 'title: Q3 — 90-day retention\noutcome: Improve 90-day retention\n\n  Readers lose their place between sessions\n    Reading reminders [testing]\n      ? readers want a nudge mid-commute [testing]\n    Resume where you left off [delivering]',
  tree: 'title: Bid for the Acme contract\ncurrency: £\n\nBid decision\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0',
  map: 'preset: assumptions\ntitle: Lantern — launch assumptions\n\nReaders finish the first book they start @ 30,90 :: test: watch 5 onboarding sessions\nAbandoned books drive churn @ 75,80 :: note: held in Q2 interviews\nLegal sign-off on publisher licensing',
  bets: 'title: Lantern — Q3 bet portfolio\nunit: £k\n\nGrowth bets\n  Referral flow v2: stake 80, odds 40-60%, payoff 300-500\n    kill: Signups per referral stay under 0.3 by 2026-09-15\n  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300',
  gauge: 'title: Q3 commitment review\nnames: off\n\nWe ship the referral loop :: prob\nWeeks to migrate billing :: range weeks\nPick the Q3 bet :: chips Offline downloads | Book clubs | Onboarding polish',
  paths: 'title: Lantern paths\ndecision groups:\n  question: Will groups retain?\n  signal: week-four retention\n  reading: 18%\n  owner: Growth\n  answer-by: 2026-09-10\n  assume: yes 2026-09-11\n  answer: yes 2026-09-08 -- cohort G-42\nNOW\n  Growth: Invite prompt [doing] [if groups]\n  Growth: Manual fallback [blocked] [unless groups]',
  proxy: 'title: Lantern invite pressure\noutcome: Groups retain after week one\nproxy: Invitation rate\naction: Prompt active members\nmode: optimise\nverdict: Keep this hunt paired with its guardrail',
  wardley: 'title: Lantern platform\nanchor: Reading\n\nLibrary @ product\nRecommendations @ custom\nCatalogue DB @ commodity\n\nReading -> Library -> Recommendations -> Catalogue DB',
  'energy/cycles': 'title: Cycle budget — Wexcombe 100MW/2h\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%',
  'energy/risk': 'title: Route to market — Wexcombe 100MW/2h\nmerchant: 60..180\n\nfloor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30',
};

/* ---- drivers: each mirrors ITS app's live-preview render call at phone width ---- */
const DRIVERS = {
  async roadmap(doc){
    const {parse} = await import('../roadmap/parse.js');
  
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
    const {renderCausalField} = await import('../why/render-causal-field.js');
    const m = parse(doc);
    return renderCausalField(m, project(m), {...ctx, edit: true, width: W});
  },
  async tree(doc){
    const {parse} = await import('../tree/parse.js');
    const {evaluate} = await import('../tree/engine.js');
    const {render} = await import('../tree/render.js');
    const m = parse(doc);
    return render(m, evaluate(m), {...ctx, edit: true, intent: 'live-narrow', width: W, coarse: true});
  },
  async map(doc){
    const {parse} = await import('../map/parse.js');
    const {resolve} = await import('../map/zones.js');
    const {readout} = await import('../map/readout.js');
    const {render} = await import('../map/render.js');
    const m = parse(doc), r = resolve(m);
    return render(m, r, readout(m, r), {...ctx, edit: true, width: W});
  },
  async bets(doc){   // value cells are unconditional; ctx.edit gates the structure surface
    const {parse} = await import('../bets/parse.js');
    const {simulate} = await import('../bets/engine.js');
    const {renderBoard} = await import('../bets/render.js');
    const m = parse(doc);
    return renderBoard(m, simulate(m), {...ctx, edit: true, width: W});
  },
  async gauge(doc){   // the odd one out: the compose surface is HTML, not SVG
    const {parse} = await import('../gauge/parse.js');
    const {renderForm} = await import('../gauge/render-form.js');
    return renderForm(parse(doc), {editable: true});
  },
  async paths(doc){
    const {parse} = await import('../paths/parse.js');
    const {project} = await import('../paths/project.js');
    const {treeProjection} = await import('../paths/tree.js');
    const {inspectorEditSurfaceMarkup} = await import('../paths/inspector.js');
    const topology = treeProjection(project(parse(doc), '2026-08-11'));
    const selected = topology.questions.find(question => question.key === 'groups');
    assert.ok(selected, 'paths phone driver failed to select the real groups topology question');
    return inspectorEditSurfaceMarkup(selected);
  },
  async proxy(){
    return readFileSync(join(ROOT, 'proxy', 'index.html'), 'utf8');
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
  test((floor.field ? 'phone Field contract: ' : 'phone edit surface: ') + tool + (floor.pilot ? ' [KNOWN GAP — pilot target]' : ''), async () => {
    const svg = await DRIVERS[tool](DOCS[tool]);
    const kinds = editKinds(svg);
    if(floor.field){
      assert.match(svg, /data-map-layout="zone-atlas-phone"/);
      assert.match(svg, /SOURCE ORDER · PLACEMENT AUDIT/);
      assert.match(svg, /data-position-hit/);
      assert.match(svg, /data-field-raw="watch 5 onboarding sessions"[^>]*data-key="test"/);
      assert.doesNotMatch(svg, /data-map-field="coordinates"/,
        'the phone audit must not be a shrunken desktop coordinate field');
      assert.deepEqual([...kinds].sort(), ['additem', 'cardmenu', 'label'],
        'only direct-reading controls belong in the phone Field; the menu carries the rest');
      return;
    }
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
