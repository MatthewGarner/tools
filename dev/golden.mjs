/* Golden-output harness: renders fixed models through render.js and writes/compares
   exact SVG strings. Usage: node dev/golden.mjs capture|compare|verify [tool-prefix]
   - compare: byte-identical check, warns if dev/golden has uncommitted changes
   - verify : compare AND assert dev/golden is fully committed (pre-merge gate) */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from '../roadmap/parse.js';
import {renderChapter, renderChapterPages} from '../roadmap/chapter-svg.js';

const ctxBase = {
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B3403A'},
    statusInk:{done:'#1C753C',doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A'}, accentInk:'#0A6C94',
    brand:'#E2231A', brandText:'#D62015'},
  measure: (t) => t.length * 7,
};
const ctxDark = {
  colors: {card:'#1A1A19',border:'#2E2E2C',ink:'#F1F1EE',muted:'#8F8F8A',accent:'#7C97FF',bg:'#121212',
    err:'#E07A72', track:'#232E37', status:{done:'#3FA163',doing:'#7C97FF',risk:'#B9880F',blocked:'#D96A61'},
    statusInk:{done:'#55AC75',doing:'#93A8FF',risk:'#BE9122',blocked:'#DD7B73'}, accentInk:'#93A8FF',
    brand:'#FF4B3E', brandText:'#FF4B3E'},
  measure: (t) => t.length * 7,
  dark: true,
};
const variants = {};
/* Chapter's real renderer owns all four reading compositions in both themes.
   Separate narrow fixtures pin each phone layout; page sets pin complete exports. */
const chapterSource = 'title: Lantern roadmap\nheadline: Make reading a habit\ndate: 2026-09-04\naccent: #254C3D\n' +
  'NOW\nCore: Resume a book [doing] -- Remember the exact place\nCore: Curated shelves [bet: shelves] -- Find the next good read\n' +
  'NEXT\nGrowth: Share a shelf [if shelves] -- An invitation from a friend\nGrowth: Reading digest [unless shelves]\n' +
  'LATER\nPlatform: E-reader sync -- Pick up on any device\nPlatform: Offline reading';
for(const style of ['grid','board','focus','register']){
  const model = parse('style: ' + style + '\n' + chapterSource);
  for(const [theme,context] of [['light',ctxBase],['dark',ctxDark]]){
    variants['chapter-' + style + '-' + theme] = renderChapter(model,context);
    const pages=renderChapterPages(model,context);
    pages.pages.forEach((svg,i)=>{variants['chapter-'+style+'-'+theme+'-slide-'+i]=svg;});
  }
}
variants['chapter-grid-narrow'] = renderChapter(parse('style: grid\n'+chapterSource),{...ctxBase,width:360,edit:true});
variants['chapter-board-narrow'] = renderChapter(parse('style: board\n'+chapterSource),{...ctxBase,width:360,edit:true});
variants['chapter-focus-narrow'] = renderChapter(parse('style: focus\n'+chapterSource),{...ctxBase,width:360,edit:true});
variants['chapter-register-narrow'] = renderChapter(parse('style: register\n'+chapterSource),{...ctxBase,width:360,edit:true});
const chapterBasis='basis: paths "Growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12\n';
variants['chapter-basis'] = renderChapter(parse(chapterBasis+chapterSource),ctxBase);
variants['chapter-basis-narrow'] = renderChapter(parse(chapterBasis+chapterSource),{...ctxBase,width:360});
variants['chapter-spans'] = renderChapter(parse('style: grid\ndate: 2026-09-04\nhorizons: monthly from Jul 2026 x4\nJul 2026\nPlatform: Sync engine x4 -- Keep every device current\nPlatform: Local cache\nAug 2026\nPlatform: Conflict resolution x2'),ctxBase);
variants['chapter-comparison'] = renderChapter(parse('style: register\nstory: The next release follows the evidence\n'+chapterSource),{...ctxBase,diff:{any:true,since:'June baseline',dropped:['Legacy import'],badge:()=>({kind:'new',label:'New'})}});
variants['chapter-dm-sans'] = renderChapter(parse('style: focus\nfont: DM Sans\n'+chapterSource),ctxBase);

/* tree fixtures (dates normalised so captures are stable) */
{
  const {parse: tparse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render: trender} = await import('../tree/render.js');
  const bid = 'title: T\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';
  const m = tparse(bid);
  const r = evaluate(m);
  variants['tree-bid'] = trender(m, r, {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['tree-bid-slide'] = trender(m, r, {...ctxBase, slide: true}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  /* `verdict:` (2026-07-31) — the two states that move layout: off collapses the
     band (the tree must rise to meet the header), authored replaces the line and
     drops the tool's evidence sentence with it. */
  const mOff = tparse('verdict: off\n' + bid);
  variants['tree-verdict-off'] = trender(mOff, evaluate(mOff), {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  const mAuth = tparse('verdict: We bid, and we bid high\n' + bid);
  variants['tree-verdict-authored'] = trender(mAuth, evaluate(mAuth), {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');

  /* The actual phone path: width-aware memo layout, editable, and coarse-pointer
     menu-only rows. This is deliberately not a scaled native export. It pins the
     narrow padding/indent geometry and the edit-only Monte Carlo attributes that
     previously had no XML golden witness. */
  variants['tree-bid-narrow'] = trender(m, r, {
    ...ctxBase, intent: 'live-narrow', width: 390, edit: true, coarse: true,
  }).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');

}

/* /why fixtures (dates normalised) */
{
  const {parse: wparse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderCausalField: renderOst} = await import('../why/render-causal-field.js');
  const {renderDeliveryLens: renderMap} = await import('../why/render-delivery-lens.js');
  const doc = 'title: T\noutcome: Retention\n  Losing your place\n    Reading reminders [testing]\n      ? wanted\n    Resume where you left off [delivering]\n      ? works [holds]\n  Choosing is work\n  Orphan [delivering]';
  const m = wparse(doc);
  const pr = project(m);
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['why-ost'] = norm(renderOst(m, pr, {...ctxBase}));
  const {whyDiff, whyDiffView} = await import('../why/diff.js');
  const oldDoc = 'title: T\noutcome: Retention\n  Losing your place\n    Reading reminders [candidate]\n      ? wanted\n  Choosing is work\n    Old idea [parked]';
  const wd = whyDiffView(whyDiff(wparse(oldDoc), m), 'SNAP');
  variants['why-ost-diff'] = norm(renderOst(m, pr, {...ctxBase}, wd));
  variants['why-map'] = norm(renderMap(m, pr, {...ctxBase}));
  variants['why-map-slide'] = norm(renderMap(m, pr, {...ctxBase, intent:'presentation'}));
  /* Wide editable Ledger: the browser's normal authoring state must stay covered
     separately from the 16:9 presentation plate and the phone stack. */
  variants['why-map-edit'] = norm(renderMap(m, pr, {...ctxBase, edit: true}));

  /* Phone is a source-order Causal stack / Delivery Ledger, never a scaled
     desktop tree or a borrowed Roadmap layout. */
  variants['why-ost-narrow'] = norm(renderOst(m, pr, {...ctxBase, edit: true, width: 360}));
  variants['why-map-narrow'] = norm(renderMap(m, pr, {...ctxBase, edit: true, width: 360}));

  /* Multi-outcome phone lens: source paths disambiguate the same readiness
     column without collapsing authored identities into one label. */
  const multiDoc = 'title: H2 product bets\noutcome: Improve 90-day retention\n  Readers lose their place between sessions\n' +
    '    Reading reminders [testing]\n      ? users want interruptions\noutcome: Grow referral revenue\n' +
    '  Sharing feels braggy\n    Private progress cards [delivering]\n      ? cards get shared [testing]\n' +
    '  No reason to invite others\n';
  const mm = wparse(multiDoc);
  const mpr = project(mm);
  variants['why-map-narrow-multi'] = norm(renderMap(mm, mpr, {...ctxBase, edit: true, width: 360}));

  /* Deep phone field: levels beyond the visual indent clamp remain readable
     through their rendered causal context. */
  const deepDoc = 'title: Deep chain\noutcome: Grow retention\n  Readers lose their place between sessions\n' +
    '    Notifications feel spammy\n      Users mute after first week\n        Frequency too high\n' +
    '          Smart batching [testing]\n            ? batching preserves timing';
  const dm = wparse(deepDoc);
  const dpr = project(dm);
  variants['why-ost-narrow-deep'] = norm(renderOst(dm, dpr, {...ctxBase, edit: true, width: 360}));

  /* Broken assumptions remain a factual Delivery Lens audit — never a ghost
     card — and must still be editable. */
  const brokenDoc = 'title: T\noutcome: Retention\n  Losing your place\n    Shaky reminders [delivering]\n      ? reading sticks [broken]';
  const bm = wparse(brokenDoc);
  const bpr = project(bm);
  variants['why-map-broken'] = norm(renderMap(bm, bpr, {...ctxBase, edit: true}));

  /* Dark is a real Field family surface, not a generic XML decode sweep:
     palette paper stays quiet, ink retains contrast, and broken remains the
     only semantic alert across both live and Copy-PNG projections. */
  const darkCtx = {...ctxBase, dark:true, colors:{...ctxBase.colors,
    bg:'#121212', ink:'#F4F4F1', muted:'#A7A7A3', border:'#2E2E2C', err:'#FF6B62'}};
  const darkModel = wparse('palette: ember\n' + brokenDoc);
  const darkProjection = project(darkModel);
  variants['why-ost-dark'] = norm(renderOst(darkModel, darkProjection, {...darkCtx, edit:true}));
  variants['why-map-dark'] = norm(renderMap(darkModel, darkProjection, {...darkCtx, edit:true}));
  variants['why-map-slide-dark'] = norm(renderMap(darkModel, darkProjection, {...darkCtx, intent:'presentation'}));
}

/* /map fixtures (dates normalised) */
{
  const {parse: mparse} = await import('../map/parse.js');
  const {resolve: mresolve} = await import('../map/zones.js');
  const {readout: mreadout} = await import('../map/readout.js');
  const {render: mrender} = await import('../map/render.js');
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  const mk = (src, extra = {}) => {
    const m = mparse(src);
    const r = mresolve(m);
    return norm(mrender(m, r, mreadout(m, r), {...ctxBase, ...extra}));
  };
  const mdocs = {
    'map-assumptions': 'preset: assumptions\ntitle: T\nA @ 20,80 :: test: interview five\nB @ 70,60\nC @ 40,90\nD',
    'map-stakeholders': 'preset: stakeholders\nCFO @ 30,85 :: attitude: sceptical\nSupport lead @ 80,40',
    'map-futures': 'preset: futures\nx: Regulation (light → strict)\ny: Adoption (slow → fast)\nzone 1,2: Walled gardens\nSignal one @ 20,75\nSignal two @ 80,30',
    'map-risk': 'preset: risk\nSlip @ 60,85 :: owner: core\nRejection @ 35,90\nQuiet risk @ 20,20',
    'map-skills': 'preset: skills\ntitle: T\nPayments integration @ 20,90 :: owner: Priya\nRelease pipeline @ 30,80 :: owner: Sam :: backup: Jo\nDesign system @ 65,55\nCopywriting @ 85,25',
    'map-rag': 'preset: rag\ntitle: T\nBilling revamp @ 25,30 :: reported: green\nOnboarding funnel @ 75,70 :: reported: green\nPartner API @ 80,30 :: reported: red',
    'map-custom': 'title: C\nx: Effort (low → high)\ny: Value (low → high)\nzones: grid 3x3\nzone 1,3: Quick wins\nzone band: x + y > 120\nThing @ 20,80\nOther @ 60,40',
  };
  for(const [k, src] of Object.entries(mdocs)) variants[k] = mk(src);
  const {mapDiff, mapDiffView} = await import('../map/diff.js');
  const oldMap = mparse('preset: assumptions\ntitle: T\nA @ 60,30 :: test: interview five\nB @ 70,60\nGone @ 10,10\nD');
  const curMap = mparse(mdocs['map-assumptions']);
  const md = mapDiffView(mapDiff(oldMap, curMap), 'SNAP');
  const rr = mresolve(curMap);
  variants['map-assumptions-dark'] = norm(mrender(curMap, rr, mreadout(curMap, rr), {...ctxDark, edit:true}));
  variants['map-diff'] = norm(mrender(curMap, rr, mreadout(curMap, rr), {...ctxBase}, md));
  variants['map-assumptions-slide'] = mk(mdocs['map-assumptions'], {slide: true});
  variants['map-verdict-off'] = mk('verdict: off\n' + mdocs['map-assumptions']);
  variants['map-verdict-authored'] = mk('verdict: We test A before anything else\n' + mdocs['map-assumptions']);

  /* A small direct-label map does not exercise Map's narrow branch: only the
     exhaustive keyed layout moves its source-order register from beside the
     plane to below it. Ten collocated items are the smallest deterministic
     fixture that selects that composition; edit:true matches the live preview. */
  const denseSource = 'preset: assumptions\ntitle: Dense assumptions\n' +
    Array.from({length: 10}, (_, i) => 'Assumption ' + (i + 1) + ' @ 50,50').join('\n');
  variants['map-dense-narrow'] = mk(denseSource, {width: 390, edit: true});
  const denseModel = mparse(denseSource), denseResolved = mresolve(denseModel);
  variants['map-dense-narrow-dark'] = norm(mrender(denseModel, denseResolved,
    mreadout(denseModel, denseResolved), {...ctxDark, width:390, edit:true}));

  const pm = mparse(mdocs['map-assumptions']);
  const pr = mresolve(pm);
  const pro = mreadout(pm, pr);
}

/* /gauge overlay fixtures (fully deterministic) */
{
  const {parse: gparse} = await import('../gauge/parse.js');
  const {sessionStats: gstats} = await import('../gauge/engine.js');
  const {renderOverlay: grender} = await import('../gauge/render-overlay.js');
  const doc = 'title: T\nnames: on\nShip by Q3 :: prob\nWeeks to migrate :: range weeks';
  const m = gparse(doc);
  const resp = [
    {values: [80, [4, 8]], name: 'Ana'},
    {values: [75, [6, 12]], name: 'Ben'},
    {values: [20, [5, 9]], name: 'Cy'},
    {values: [15, [30, 50]], name: 'Di'},
  ];
  variants['gauge-overlay'] = grender(m, gstats(m, resp), {...ctxBase});
  /* `verdict:` (2026-07-31): gauge was the one tool with no golden for the key,
     and the one where review found two live bypasses. */
  const gOff = gparse('verdict: off\n' + doc);
  variants['gauge-verdict-off'] = grender(gOff, gstats(gOff, resp), {...ctxBase});
  const gAuth = gparse('verdict: The room is split on shipping\n' + doc);
  variants['gauge-verdict-authored'] = grender(gAuth, gstats(gAuth, resp), {...ctxBase});
  const agree = [{values: [[4, 8]]}, {values: [[5, 9]]}, {values: [[3, 7]]}];
  const m2 = gparse('Weeks :: range weeks');
  variants['gauge-overlay-agree'] = grender(m2, gstats(m2, agree), {...ctxBase});
  const mc = gparse('title: Feature bets\nnames: on\nPick the Q3 bet :: chips Offline downloads | Book clubs | Onboarding polish');
  const cresp = [{values: [[50, 30, 20]], name: 'Ana'}, {values: [[45, 35, 20]], name: 'Ben'},
    {values: [[40, 35, 25]], name: 'Cy'}, {values: [[0, 100, 0]], name: 'Di'}];
  variants['gauge-overlay-chips'] = grender(mc, gstats(mc, cresp), {...ctxBase});
  /* narrow (phone) relayout: same fixtures at a 360px width */
  variants['gauge-overlay-narrow'] = grender(m, gstats(m, resp), {...ctxBase}, {width: 360});
  variants['gauge-overlay-chips-narrow'] = grender(mc, gstats(mc, cresp), {...ctxBase}, {width: 360});
}

/* /flow readout fixtures (seeded sim → deterministic) */
{
  const {simulate, wipSweep, kneeWip} = await import('../flow/engine.js');
  const {renderReadout} = await import('../flow/render.js');
  for(const [name, params] of [
    ['flow-default', {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5}],
    ['flow-overloaded', {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 12, cov: 1.0}],
  ]){
    const result = simulate(params);
    const sweep = wipSweep(params);
    variants[name] = renderReadout(result, sweep, kneeWip(sweep), params, {...ctxBase,
      colors: {...ctxBase.colors, track: '#edf0ee'}});
  }

  /* batch U-curve + queue triage panels (#75, #65) */
  const {leverTriage} = await import('../flow/engine.js');
  const {batchEconomics} = await import('../flow/economics.js');
  const {renderBatch, renderTriage, renderExpedite, renderDice} = await import('../flow/render.js');
  const {expediteSensitivity} = await import('../flow/expedite.js');
  const {diceGame} = await import('../flow/dice.js');
  const fctx = {...ctxBase, colors: {...ctxBase.colors, track: '#edf0ee'}};
  const econP = {demandPerWeek: 3, transactionCost: 1000, holdCostPerItemWeek: 500, currentBatch: 8, maxBatch: 30};
  variants['flow-batch'] = renderBatch(batchEconomics(econP), econP, fctx);
  const healthyP = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  const overP = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  variants['flow-triage-drain'] = renderTriage(leverTriage(overP, {initialBacklog: 20}), overP, 20, fctx);
  variants['flow-triage-lead'] = renderTriage(leverTriage(healthyP, {initialBacklog: 0}), healthyP, 0, fctx);
  variants['flow-expedite'] = renderExpedite(expediteSensitivity(healthyP, {expeditePerWeek: 1}), fctx);
  variants['flow-dependent-dice'] = renderDice(diceGame({days: 30, seed: 4}), fctx);
}

/* /fermi driver-tree fixtures (#73): seeded MC → deterministic sens → exact SVG */
{
  const E = await import('../fermi/engine.js');
  const {renderDriverTree} = await import('../fermi/render-driver.js');
  const {quantile} = await import('../assets/series.js');
  const build = (f, ranges) => {
    const ast = E.parse(E.tokenize(f));
    const varNames = E.collectVars(ast, []);
    const dists = {};
    for(const n of varNames) dists[n] = 'auto';
    const m = {ast, varNames, ranges, dists};
    const {sorted} = E.simulateModel(m, {seed: 0x5EED, n: 20000});
    const p10 = quantile(sorted, .1), p50 = quantile(sorted, .5), p90 = quantile(sorted, .9);
    return {...m, p10, p50, p90, ...E.computeSensitivity(m, {seed: 0x5EED, p10, p90})};
  };
  variants['fermi-driver-meeting'] = renderDriverTree(
    build('attendees * hourly_cost * meeting_hours * weeks_per_year',
      {attendees: [6, 10], hourly_cost: [60, 120], meeting_hours: [0.75, 1.5], weeks_per_year: [44, 48]}),
    {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}});
  variants['fermi-driver-pianos'] = renderDriverTree(
    build('households * share_with_piano * tunings_per_year / (tunings_per_day * working_days)',
      {households: [3e6, 4e6], share_with_piano: [0.02, 0.08], tunings_per_year: [0.5, 2],
       tunings_per_day: [2, 5], working_days: [220, 260]}),
    {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}});
}

/* /fermi cashflow fixtures (#13): seeded → deterministic */
{
  const {simulateCashflow} = await import('../fermi/cashflow.js');
  const {renderCashflow} = await import('../fermi/render-cashflow.js');
  const R = (lo, hi) => ({lo, hi});
  const cctx = {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}};
  const invest = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)],
    horizon: 5, grain: 'year', rate: R(8, 12)};
  variants['fermi-cashflow-invest'] = renderCashflow(simulateCashflow(invest, {seed: 0xCA5F, n: 10000}), invest, cctx);
  const runway = {periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)};
  variants['fermi-cashflow-runway'] = renderCashflow(simulateCashflow(runway, {seed: 0xCA5F, n: 10000}), runway, cctx);
  const geared = {periods: [R(-7.2e6, -6.8e6), ...Array(15).fill(R(880e3, 1.35e6))], horizon: 15,
    grain: 'year', rate: R(9, 11), debt: {dscr: 1.45, costOfDebt: 0.065, tenor: 9, sizingCase: 'central'}};
  variants['fermi-cashflow-geared'] = renderCashflow(simulateCashflow(geared, {seed: 0xCA5F, n: 10000}), geared, cctx);
}

/* /timeline fixtures (today pinned in the doc → deterministic) */
{
  const {parse: tparse} = await import('../timeline/parse.js');
  const {render: trender} = await import('../timeline/render.js');
  const {timelineDiff, timelineDiffView} = await import('../timeline/diff.js');
  const tdoc = 'title: T — programme\ntoday: 2026-07-06\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-02-15 .. 2027-06-01 [risk] // long pole\nBuild: FID 2026-06-30 [done]\nBuild: Vendor selection 2026-11';
  const tOld = 'title: T — programme\ntoday: 2026-07-06\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-01 .. 2027-04\nBuild: FID 2026-06-30 [done]\nBuild: Dropped thing 2026-12 .. 2027-01';
  const tm = tparse(tdoc);
  const tctx = {...ctxBase, today: 20640};
  variants['timeline-default'] = trender(tm, tctx);
  const {observatoryPages} = await import('../timeline/observatory.js');
  for(const style of ['field','review','decisions','register']){
    const configured=tparse('style: '+style+'\nfont: DM Sans\naccent: #315D48\n'+tdoc.replace('Offer 2026-08 .. 2026-10','Offer 2026-08 .. 2026-10 [started: 2026-06-01]'));
    variants['timeline-observatory-'+style]=trender(configured,tctx);
  }
  const busy=tparse('title: Six quarter forecast\ntoday: 2026-07-06\n'+Array.from({length:24},(_,i)=>`Lane ${i%4}: Milestone ${i} 2026-08 .. 2027-12 [started: 2026-06-01] // Authored commentary ${i}`).join('\n'));
  for(const page of observatoryPages(busy,tctx).pages)variants['timeline-deck-'+page.index]=page.svg;

  /* Export is its own physical intent: one 16:9 Field with a shared ruler, not
     a legacy `slide` flag quietly falling back to the live board. */
  variants['timeline-presentation'] = trender(tm, {...tctx, intent:'presentation'}, null, {intent:'presentation'});
  variants['timeline-native'] = trender(tm, {...tctx, intent:'native'}, null, {intent:'native'});
  const timelineDark = {...tctx, dark:true, colors:{
    card:'#1A1A19', border:'#2E2E2C', ink:'#F1F1EE', muted:'#8F8F8A', accent:'#7C97FF', bg:'#121212', err:'#E07A72',
    status:{done:'#3FA163',doing:'#7C97FF',risk:'#B9880F',blocked:'#D96A61'},
    statusInk:{done:'#55AC75',doing:'#93A8FF',risk:'#BE9122',blocked:'#DD7B73'}, accentInk:'#93A8FF',
  }};
  variants['timeline-dark'] = trender(tm, timelineDark);
  variants['timeline-narrow-dark'] = trender(tm, {...timelineDark, width:360}, null, {intent:'live-narrow'});
  variants['timeline-presentation-dark'] = trender(tm, {...timelineDark, intent:'presentation'}, null, {intent:'presentation'});
  variants['timeline-diff'] = trender(tm, tctx,
    timelineDiffView(timelineDiff(tparse(tOld), tm), 'JUNE PACK'));
  /* A wrapped comparison addition belongs in the end-cap, clear of its date
     fact, in both live and presentation Fields. */
  const tNewOld = tparse('Lane: Existing 2026-08 .. 2026-09');
  const tNew = tparse('Lane: Existing 2026-08 .. 2026-09\nLane: ' + 'A'.repeat(80) + ' 2026-10 .. 2026-11');
  const tNewDiff = timelineDiffView(timelineDiff(tNewOld, tNew), 'AUGUST REVIEW');
  variants['timeline-diff-new-wrapped'] = trender(tNew, tctx, tNewDiff);
  variants['timeline-diff-new-wrapped-narrow'] = trender(tNew, {...tctx, width:360}, tNewDiff, {intent:'live-narrow'});
  variants['timeline-diff-new-wrapped-presentation'] = trender(tNew, {...tctx, intent:'presentation'}, tNewDiff, {intent:'presentation'});
  const tEmpty = tparse('title: Empty timing plan');
  variants['timeline-empty'] = trender(tEmpty, tctx, null, {edit:true});
  variants['timeline-empty-presentation'] = trender(tEmpty, {...tctx, intent:'presentation'}, null, {intent:'presentation'});

  // short whisker + long label → today the P90 diamond splices the date text.
  // NOTE SEPARATOR IS // (the DSL), not · (· is only the renderer's formatting of a
  // parsed note; a · in the source makes parse fail the 2nd date → a single, and the
  // re-anchor gate !single would EXCLUDE it — the fixture wouldn't pin the bug).
  // tlShort pins BOTH arms: Feature freeze → right-of-P90, Store review → flip-left.
  const tlShort = 'title: Q3 launch\nApp: Feature freeze 2026-08-14 .. 2026-08-28\n' +
    'App: Store review passed 2026-10-15 .. 2026-11-15 // review times vary wildly';
  variants['timeline-shortwhisker'] = trender(tparse(tlShort), {...tctx});
  /* `verdict:` (2026-07-31): off collapses the readout band; authored replaces the
     line AND drops the tool's operational "rest" bits that followed it. */
  variants['timeline-verdict-off'] = trender(tparse('verdict: off\n' + tdoc), tctx);
  variants['timeline-verdict-authored'] = trender(tparse('verdict: We hold the energisation date\n' + tdoc), tctx);
  // pins the M4 packing push: item 1's dates+note sub-line is wider than its label.
  const tlNote = 'title: Notes\nApp: Ship it 2026-08-01 .. 2026-08-05 // a deliberately long trailing note that runs wide\n' +
    'App: Next thing 2026-08-20';
  variants['timeline-longnote'] = trender(tparse(tlNote), {...tctx});

  // narrow relayout (Ship 2): the same docs at a phone container width render the
  // stacked shared-axis relayout (renderNarrow) — lane sections, per-milestone track
  // bands with the whisker on one shared axis. The diff variant carries width in its
  // ctx (2nd arg) so compare (ghosts/slips/since/NEW/dropped) is exercised on narrow.
  variants['timeline-narrow'] = trender(tm, {...tctx, width: 360});
  variants['timeline-narrow-diff'] = trender(tm, {...tctx, width: 360},
    timelineDiffView(timelineDiff(tparse(tOld), tm), 'JUNE PACK'));

  // merge-bias: ≥2 ranged lane-completions ⇒ the 2nd readout row + the merge-risk verdict
  const tMerge = 'title: Programme — merge risk\ntoday: 2026-07-06\n' +
    'Grid: Energisation 2027-02 .. 2027-06 [risk]\nBuild: Commissioning 2027-03 .. 2027-08\nConsents: DCO 2027-01 .. 2027-05';
  const tmm = tparse(tMerge);
  variants['timeline-mergebias'] = trender(tmm, tctx);

  // [fixed]: ink diamonds + the deadline verdict (3 ranged lanes racing an external gate)
  const tFix = 'title: Consent programme\ntoday: 2026-07-06\n' +
    'Ofgem decision 2026-12-01 [fixed]\n' +
    'Grid: Energisation 2026-09 .. 2026-11\nBuild: Commissioning 2026-10 .. 2027-01\n' +
    'Consents: DCO 2026-08 .. 2026-10';
  const tfm = tparse(tFix);
  variants['timeline-fixed'] = trender(tfm, tctx);
  variants['timeline-fixed-narrow'] = trender(tfm, {...tctx, width: 360});

  /* Last-responsible-moment: a named decision clock, not another forecast bar.
     Wide + phone pin the derived diamond/receipt, while the fixed event still
     participates as the ordinary external date it always was. */
  const tLead = 'title: Office move — decision clock\ntoday: 2026-08-01\n' +
    'Fit-out: Construction complete 2026-09 .. 2026-12\n' +
    'IT: Network installed 2026-11 .. 2027-01\n' +
    'Lease ends 2027-02-28 [fixed] [lead: 6w]';
  const tlm = tparse(tLead);
  variants['timeline-lrm'] = trender(tlm, tctx);
  variants['timeline-lrm-narrow'] = trender(tlm, {...tctx, width: 360});
  /* An authored conclusion may lead the receipt, but an active decision clock
     must remain visible in the presentation artefact as a named fact. */
  const tlmAuth = tparse('verdict: Hold the office move inside the review window\n' + tLead);
  variants['timeline-lrm-authored-presentation'] = trender(tlmAuth, {...tctx, intent:'presentation'}, null, {intent:'presentation'});

}

/* /risk fixtures (seeded engine → deterministic) */
{
  const {parse: rparse} = await import('../energy/risk/parse.js');
  const {simulate, fmtUnit: rFmtUnit} = await import('../energy/risk/engine.js');
  const {render: rrender, riskVerdict, focusedIndex} = await import('../energy/risk/render.js');
  const rdoc = 'title: Route to market — Wexcombe 100MW/2h\nmerchant: 60..180\n' +
    'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
  const rm = rparse(rdoc);
  const rs = simulate(rm);
  variants['risk-routes'] = rrender(rm, rs, {...ctxBase});
  variants['risk-routes-slide'] = rrender(rm, rs, {...ctxBase, slide: true});
  variants['risk-routes-narrow'] = rrender(rm, rs, {...ctxBase, width: 360});
  variants['risk-routes-focus'] = rrender(rm, rs, {...ctxBase}, {edit: true, focus: 2});
  /* `verdict:` (2026-07-31): off collapses the trade band (the svg height follows),
     authored replaces the line and drops the row name from the kicker. */
  const rmOff = rparse('verdict: off\n' + rdoc);
  variants['risk-verdict-off'] = rrender(rmOff, simulate(rmOff), {...ctxBase});
  const rmAuth = rparse('verdict: We take the floor and live with the cap\n' + rdoc);
  variants['risk-verdict-authored'] = rrender(rmAuth, simulate(rmAuth), {...ctxBase});

  const rFi = focusedIndex(rs.rows, null);
  const rRow = rs.rows[rFi];
}

/* /cycles fixtures (seeded engine → deterministic; n reduced for capture speed) */
{
  const {parse: cparse} = await import('../energy/cycles/parse.js');
  const {simulate: csim, verdict: cVerdict, fmtUnit: cFmtUnit} = await import('../energy/cycles/engine.js');
  const {render: crender} = await import('../energy/cycles/render.js');
  const cdoc = 'title: Cycle budget — Wexcombe 100MW/2h\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%';
  const cm = cparse(cdoc);
  const co = csim(cm, {seed: 1, n: 2000});
  variants['cycles-full'] = crender(cm, co, {...ctxBase});
  variants['cycles-full-slide'] = crender(cm, co, {...ctxBase, slide: true});
  variants['cycles-full-narrow'] = crender(cm, co, {...ctxBase, width: 360});
  const cmOff = cparse('verdict: off\n' + cdoc);
  variants['cycles-verdict-off'] = crender(cmOff, csim(cmOff, {seed: 1, n: 2000}), {...ctxBase});
  const cmAuth = cparse('verdict: Cycle harder, the spread pays\n' + cdoc);
  variants['cycles-verdict-authored'] = crender(cmAuth, csim(cmAuth, {seed: 1, n: 2000}), {...ctxBase});
  const cg = cparse(cdoc.replace('second: 35..60%\n', '').replace('augment: 120..180 £/kWh\n', ''));
  variants['cycles-ghosts'] = crender(cg, csim(cg, {seed: 1, n: 2000}), {...ctxBase}, {edit: true});

}

/* /frequency fixtures (pure ODE, no seed needed — deterministic by construction) */
{
  const {simulate: fsim} = await import('../energy/frequency/engine.js');
  const {renderTrace: frender} = await import('../energy/frequency/render.js');
  const fp = {trip: 1.8, eSync: 80, drMw: 0.5, dmMw: 0.5, dcMw: 1.5, battMW: 2.5, eGfm: 20, load: 30};
  variants['frequency-rescue'] = frender(fsim(fp), fp, {...ctxBase});
  const fShed = {trip: 1.8, eSync: 80, load: 30};
  variants['frequency-2030'] = frender(fsim(fShed), fShed, {...ctxBase});
}

/* /merit-order fixtures (pure engine, no seed needed — deterministic by construction) */
{
  const {renderStack, MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const {buildStack} = await import('../energy/merit-order/stack.js');
  const {DEFAULT_PARAMS, paramsFor, WORLDS} = await import('../energy/merit-order/scenarios.js');
  const mctx = {...ctxBase, palette: MERIT_PALETTE.light};
  const mk = p => ({generators: buildStack(p), demand: p.demand});
  const mkw = (w, p) => ({generators: buildStack(p, WORLDS[w].catalogue), demand: p.demand});
  // labelCollide:'drop' matches the live page (app.js) — merit-order opted in 2026-07-11
  const mopts = {forExport: true, labelCollide: 'drop'};
  variants['merit-order-typical'] = renderStack(mk(DEFAULT_PARAMS), mctx, mopts);
  variants['merit-order-typical-narrow'] = renderStack(mk(DEFAULT_PARAMS), {...mctx, width: 360}, mopts);
  variants['merit-order-negative'] = renderStack(mk(paramsFor('gbToday', 'negative')), mctx, mopts);
  variants['merit-order-fes-ht'] = renderStack(mkw('ht', paramsFor('ht', null)), mctx, mopts);
  variants['merit-order-fes-he-coldpeak'] = renderStack(mkw('he', paramsFor('he', 'coldPeak')), mctx, mopts);

  const {buildVerdict: moVerdict} = await import('../energy/merit-order/render.js');
  const {dispatch: moDispatch} = await import('../energy/merit-order/engine.js');
  const moState = mk(DEFAULT_PARAMS);
  const moResult = moDispatch(moState.generators, moState.demand);
}

/* /intraday fixtures (deterministic by construction) */
{
  const {runDay, DAY_DEFAULTS} = await import('../energy/intraday/day.js');
  const {renderDay} = await import('../energy/intraday/render-day.js');
  const {renderDayStackExport} = await import('../energy/intraday/render-export.js');
  const {MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const {GB_TODAY} = await import('../energy/merit-order/technologies.js');
  const ictx = {width: 900, height: 420, palette: MERIT_PALETTE.light,
    colors: {ink: '#1b2733', muted: '#66727e', accent: '#C05621', grid: '#e3e7ea', card: '#ffffff'}};
  const exportCtx = {...ictx, colors: {...ictx.colors, bg: '#f5f2ed'}, measure: t => t.length * 7};
  const pFleet = {...DAY_DEFAULTS, fleetGW: 6};
  variants['intraday-raw'] = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ictx, {forExport: true});
  variants['intraday-fleet'] = renderDay(runDay(pFleet), pFleet, ictx, {forExport: true});
  variants['intraday-fleet-narrow'] = renderDay(runDay(pFleet), pFleet, {...ictx, width: 360}, {forExport: true});
  for(const [kind, params] of [['raw', DAY_DEFAULTS], ['fleet', pFleet]]) for(const hour of [0, 12, 23])
    variants[`intraday-day-stack-${kind}-h${hour}`] = renderDayStackExport({
      result: runDay(params), params, hour, catalogue: GB_TODAY, date: '20 Aug 2026', ...exportCtx,
    });
}

/* /case fixtures (typographic cover → deterministic) */
{
  const {parse: cparse} = await import('../case/parse.js');
  const {render: crender} = await import('../case/render.js');
  const {planningRole} = await import('../case/planning-context.js');
  const cdoc = 'title: Wexcombe augmentation\nquestion: Augment in 2029, or run the fleet down?\n' +
    'status: decided\nverdict: We augment — the warranty binds 3 years before the wear does\n' +
    'Money: Augment NPV model -> /fermi/#abc // the £ case\nMoney: Board options -> /tree/#def\n' +
    'Decision: Outcome plan -> /paths/#ghi\nDelivery: Timing forecast -> /timeline/#jkl\n' +
    'Risk: Premortem register -> /premortem/#mno';
  const cctx = {...ctxBase, today: '2026-08-02'};
  const context = model => ({...model, exhibits:model.exhibits.map(exhibit =>
    ({...exhibit, planning:planningRole(exhibit.url)}))});
  const cm = context(cparse(cdoc));
  variants['case-cover'] = crender(cm, cctx);
  const cOpen = context(cparse(cdoc.replace('status: decided', 'status: open').replace(/verdict: [^\n]*\n/, '')));
  variants['case-open'] = crender(cOpen, cctx);
  const cGhost = context(cparse(cdoc + '\nUnlinked thing -> https://example.com/x'));
  variants['case-ghost'] = crender(cGhost, cctx);
  variants['case-narrow'] = crender(cm, {...cctx, width: 390});
  const cProjection = context(cparse('title: Lantern delivery projection\nstatus: open\n' +
    'Delivery: Chosen outcome -> /roadmap/#x'));
  cProjection.exhibits[0].planning = {kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:'Lantern growth decisions',
      known:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
      assumed:[{key:'groups', direction:'no', date:'2026-08-12'}]}};
  variants['case-projection'] = crender(cProjection, cctx);
  const {DEFAULT_TEXT,EXAMPLES} = await import('../case/examples.js');
  const {buildCaseDeck} = await import('../case/deck-svg.js');
  for(const view of ['brief','compare','review']) {
    const source=(view==='review'?EXAMPLES[3].text:DEFAULT_TEXT)+'\nview: '+view;
    variants['case-'+view]=crender(cparse(source),{...cctx,width:1100});
    variants['case-'+view+'-phone-dark']=crender(cparse(source),{...cctx,width:390,dark:true});
  }
  for(const page of buildCaseDeck(cparse(DEFAULT_TEXT),{measure:cctx.measure}).pages)
    variants['case-deck-'+page.index]=page.svg;

}

/* /wardley fixtures (pure layout → deterministic) */
{
  const {parse: wparse} = await import('../wardley/parse.js');
  const {layoutMap} = await import('../wardley/layout.js');
  const {renderMap: wrender, mapReadout} = await import('../wardley/render.js');
  const wdoc = 'title: Lantern platform\nanchor: Reading\n' +
    'Recommendations @ custom\nNotification service @ product\nCatalogue DB @ commodity\nPush gateway\n' +
    'Reading -> Recommendations -> Notification service -> Push gateway\nRecommendations -> Catalogue DB';
  const wPrev = wdoc.replace('Recommendations @ custom', 'Recommendations @ 0.30')
    .replace('\nCatalogue DB @ commodity', '\nCatalogue DB @ commodity\nOld cache @ product')
    .replace('Recommendations -> Catalogue DB', 'Recommendations -> Catalogue DB\nRecommendations -> Old cache');
  const wctx = {...ctxBase, today: '2026-08-21'};
  const wm = wparse(wdoc);
  variants['wardley-map'] = wrender(wm, layoutMap(wm), wctx);
  const wmOff = wparse('verdict: off\n' + wdoc);
  variants['wardley-verdict-off'] = wrender(wmOff, layoutMap(wmOff), wctx);
  const wmAuth = wparse('verdict: Buy the gateway, build the engine\n' + wdoc);
  variants['wardley-verdict-authored'] = wrender(wmAuth, layoutMap(wmAuth), wctx);
  variants['wardley-compare'] = wrender(wm, layoutMap(wm), wctx,
    {compare: {prev: wparse(wPrev), label: 'March'}});
  variants['wardley-narrow'] = wrender(wm, layoutMap(wm), {...wctx, width: 390});
  variants['wardley-edit'] = wrender(wm, layoutMap(wm), wctx, {edit: true});
  variants['wardley-narrow-edit'] = wrender(wm, layoutMap(wm), {...wctx, width: 390}, {edit: true});
  /* A presentation plate is only valid when the field is complete at a
     projection-readable type floor; these fixtures pin that actual Copy PNG
     route plus the dark family, not a decorative surrogate. */
  variants['wardley-presentation'] = wrender(wm, layoutMap(wm), {...wctx, intent: 'presentation'}, {intent: 'presentation'});
  variants['wardley-dark'] = wrender(wm, layoutMap(wm), {...ctxDark, today: '2026-08-21'});
  variants['wardley-presentation-dark'] = wrender(wm, layoutMap(wm), {...ctxDark, today: '2026-08-21', intent: 'presentation'}, {intent: 'presentation'});

  const wComps = layoutMap(wm).nodes.filter(n => !n.anchor);
  const wGhosts = wComps.filter(n => n.ghost).length;
}

/* /bets fixtures (DSL → seeded MC → board; deterministic) */
{
  const {parse: bparse} = await import('../bets/parse.js');
  const {simulate} = await import('../bets/engine.js');
  const {renderBoard} = await import('../bets/render.js');
  const bdoc = 'title: Q3 product portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 30-50%, payoff 400-900\n    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Paid acq push: stake 80, odds 20-30%, payoff 90-140\n' +
    'Platform\n  Billing rewrite: stake 200, odds 90-100%, payoff 250-350';
  const bm = bparse(bdoc), bsim = simulate(bm);
  variants['bets-board'] = renderBoard(bm, bsim, ctxBase);
  variants['bets-narrow'] = renderBoard(bm, bsim, {...ctxBase, width: 390});
  variants['bets-board-dark'] = renderBoard(bm, bsim, ctxDark);

  const {verdictCopy: betsVerdict} = await import('../bets/engine.js');
  const bCounts = {kill: 1};

  /* view 2: risk-return quadrant (read-only; no compare wiring) */
  const {renderQuadrant} = await import('../bets/render-quadrant.js');
  variants['bets-quadrant'] = renderQuadrant(bm, bsim, ctxBase);
  variants['bets-quadrant-narrow'] = renderQuadrant(bm, bsim, {...ctxBase, width: 390});
  variants['bets-quadrant-dark'] = renderQuadrant(bm, bsim, ctxDark);

  /* crowded fixture: the point of the greedy label-placement task — 12 bets
     across 3 lanes, several deliberately clustered near break-even (odds
     ~42-58%) and near each other so placement is genuinely stress-tested. */
  const crowdedDoc = 'title: Q4 crowded portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 40-55%, payoff 300-500\n' +
    '    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Onboarding tweak: stake 60, odds 45-55%, payoff 90-140\n' +
    '  Referral loop: stake 50, odds 42-52%, payoff 80-130\n' +
    '  Paid acq test: stake 70, odds 35-50%, payoff 100-160\n' +
    'Platform\n  Billing rewrite: stake 200, odds 90-100%, payoff 250-350\n' +
    '  Infra migration: stake 90, odds 48-58%, payoff 120-200\n' +
    '  API v2: stake 40, odds 44-54%, payoff 60-100\n' +
    '  Cache layer: stake 55, odds 46-56%, payoff 70-120\n' +
    'Risk\n  Sure loser: stake 100, odds 10-20%, payoff 50-80\n' +
    '  Moonshot: stake 30, odds 5-15%, payoff 800-1500\n' +
    '  Compliance fix: stake 80, odds 47-53%, payoff 100-150\n' +
    '    kill: no lift after 1 sprint by 2026-10-01\n' +
    '  Support tool: stake 45, odds 43-53%, payoff 65-110';
  const bmCrowded = bparse(crowdedDoc), bsimCrowded = simulate(bmCrowded);
  variants['bets-quadrant-crowded'] = renderQuadrant(bmCrowded, bsimCrowded, ctxBase);
  variants['bets-quadrant-crowded-narrow'] = renderQuadrant(bmCrowded, bsimCrowded, {...ctxBase, width: 390});

  /* snapshot compare fixture: vs bdoc, "Paid acq push" is new, "Old idea" was
     killed, and Billing rewrite's odds moved 60-75% -> 90-100%. */
  const {betsDiff, betsDiffView} = await import('../bets/diff.js');
  const boldDoc = 'title: Q3 product portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 30-50%, payoff 400-900\n    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Old idea: stake 40, odds 25-35%, payoff 60-100\n' +
    'Platform\n  Billing rewrite: stake 200, odds 60-75%, payoff 250-350';
  const bOld = bparse(boldDoc), bPrevSim = simulate(bOld);
  const bView = betsDiffView(betsDiff(bOld, bm), '2026-06-01');
  const bCompareCtx = {...ctxBase, compare: {...bView, prevSim: bPrevSim}};
  variants['bets-compare'] = renderBoard(bm, bsim, bCompareCtx);
  variants['bets-compare-narrow'] = renderBoard(bm, bsim, {...bCompareCtx, width: 390});
}

/* /paths fixtures: real DSL through the complete semantic projection. The wide
   tree and narrow outline share one authored document so both presentations are
   byte-gated against the same answered/open topology; the refusal fixture pins
   the explicit Tree boundary when plan enumeration exceeds its safe limit. */
{
  const {parse: parsePaths} = await import('../paths/parse.js');
  const {project: projectPaths} = await import('../paths/project.js');
  const {treeProjection} = await import('../paths/tree.js');
  const {treeLayout} = await import('../paths/layout-tree.js');
  const {renderTree, renderOutline} = await import('../paths/render-tree.js');
  const {renderPlans, renderPlansNarrow} = await import('../paths/render-plans.js');
  const pathsDoc = 'title: Lantern decision paths\ndate: 2026-08-11\nverdict: Keep the rollout reversible while groups remains open\n' +
    'decision reminders:\n  question: Do adaptive reminders improve week-four retention?\n' +
    '  signal: week-four retention\n  reading: +6 percentage points\n  owner: Core\n' +
    '  answer-by: 2026-07-24\n  answer: yes 2026-07-22 -- experiment HBT-42\n' +
    'decision groups:\n  question: Will people invite three friends without prompting?\n' +
    '  signal: invites per active user\n  reading: 2.4\n  owner: Growth\n  answer-by: 2026-09-15\n' +
    'NOW\n  Core: Resume position fix [done]\n  Core: Adaptive reminder rollout [doing] [if reminders] -- staged release\n' +
    '  Core: Manual reminder fallback [unless reminders]\n' +
    'NEXT\n  Growth: Friend invite prompt [risk] [if groups]\n' +
    '  Platform: Moderation controls [blocked] [if groups and reminders] -- privacy review\n' +
    'LATER\n  Growth: Solo challenges [unless groups]';
  const pathsProjected = projectPaths(parsePaths(pathsDoc), '2026-08-11');
  const pathsTree = treeProjection(pathsProjected);
  const pathsCtx = {...ctxBase, today:'2026-08-11', projection:pathsProjected};
  variants['paths-tree'] = renderTree(pathsTree,
    treeLayout(pathsTree, {width:1160, measure:ctxBase.measure}), pathsCtx);
  variants['paths-outline-narrow'] = renderOutline(pathsTree, {...pathsCtx, width:390});
  const plansProjected = projectPaths(parsePaths(pathsDoc.replace(
    'title: Lantern decision paths', 'style: plans\ntitle: Lantern possible plans')), '2026-08-11');
  const plansCtx = {...ctxBase, today:'2026-08-11', projection:plansProjected};
  variants['paths-plans'] = renderPlans(plansProjected, {...plansCtx, width:1160});
  variants['paths-plans-narrow'] = renderPlansNarrow(plansProjected, {...plansCtx, width:390});

  const openDecision = index => 'decision q' + index + ':\n  question: Is signal ' + index + ' strong enough?\n' +
    '  signal: signal ' + index + '\n  owner: Team ' + index + '\n  answer-by: 2026-09-' +
    String(index + 10).padStart(2, '0');
  const refusedDoc = 'title: Seven-question boundary\ndate: 2026-08-11\n' +
    Array.from({length:7}, (_, index) => openDecision(index)).join('\n') +
    '\nNOW\n  Core: Shared foundation\n' +
    Array.from({length:7}, (_, index) => '  Team ' + index + ': Conditional work ' + index + ' [if q' + index + ']').join('\n');
  const refusedProjected = projectPaths(parsePaths(refusedDoc), '2026-08-11');
  const refusedTree = treeProjection(refusedProjected);
  variants['paths-tree-refused'] = renderTree(refusedTree,
    treeLayout(refusedTree, {width:1160, measure:ctxBase.measure}),
    {...ctxBase, today:'2026-08-11', projection:refusedProjected});
  const refusedPlans = projectPaths(parsePaths('style: plans\n' + refusedDoc), '2026-08-11');
  variants['paths-plans-refused'] = renderPlans(refusedPlans,
    {...ctxBase, today:'2026-08-11', projection:refusedPlans, width:1160});
}

/* /alarm fixtures (pure numeric params → deterministic) */
{
  const {renderDistributions} = await import('../alarm/render.js');
  variants['alarm-dist'] = renderDistributions({baseRate: 0.02, dprime: 2, t: 1.2}, ctxBase.colors, {w: 900, h: 220});
}

/* /signal-vs-noise fixtures (seeded scenario → deterministic): mid-game grid at
   3 cols and the 1-col narrow relayout, plus the collapse verdict artefact. */
{
  const {makeScenario, AUTHORED_SEED} = await import('../signal-vs-noise/engine.js');
  const {renderGrid, renderCollapse} = await import('../signal-vs-noise/render.js');
  const s = makeScenario(AUTHORED_SEED);
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}, {person: s.signalPerson, quarter: 7}];
  variants['signal-noise-grid'] = renderGrid(s, ctxBase.colors, {turn: 4, calls, width: 1088});
  variants['signal-noise-grid-narrow'] = renderGrid(s, ctxBase.colors, {turn: 4, calls, cols: 1});
  variants['signal-noise-collapse'] = renderCollapse(s, ctxBase.colors, calls, {width: 1088});
  variants['signal-noise-collapse-narrow'] = renderCollapse(s, ctxBase.colors, calls, {width: 356});
}

/* /paths Overview: one fixture deliberately carries parallel active work plus
   every secondary decision state. The wide export pins the canonical
   period-by-lane grid and complete state ledger; narrow pins the agenda
   relayout without changing the underlying work or decision identities. */
{
  const {parse:parsePaths} = await import('../paths/parse.js');
  const {project:projectPaths} = await import('../paths/project.js');
  const {overviewProjection, decisionImpactProjection} = await import('../paths/overview.js');
  const {renderOverview, renderOverviewNarrow} = await import('../paths/render-overview.js');
  const {renderDependencies, renderDependenciesNarrow} = await import('../paths/render-dependencies.js');
  const {renderQuestionLens, renderQuestionLensNarrow} = await import('../paths/render-question-lens.js');
  const {renderConditions, renderConditionsNarrow} = await import('../paths/render-conditions.js');
  const {learningAgendaProjection} = await import('../paths/learning-agenda.js');
  const {renderLearningAgenda, renderLearningAgendaNarrow} = await import('../paths/render-learning-agenda.js');
  const decision = (name, extra = '') => `decision ${name}:\n  question: Does ${name} hold?\n` +
    `  signal: measurable ${name}\n  reading: current ${name}\n  owner: ${name} owner\n` +
    `  answer-by: 2026-08-10${extra}\n`;
  const source = 'title: Parallel Lantern\ndate: 2026-08-11\nverdict: Keep both routes reversible\n' +
    decision('pricing') + decision('groups', '\n  assume: no 2026-08-11') +
    decision('settled', '\n  answer: yes 2026-08-10 -- experiment HBT-42') +
    decision('host', '\n  answer: yes 2026-08-10') + decision('pending') +
    decision('later-question', '\n  when: pending') + decision('retired-question', '\n  when: not host') +
    'decision repair:\n  question: Repair this?\n  answer-by: 2026-08-10\n' +
    'NOW\n  Core: Shared foundation [doing]\n  Growth: Price route [if pricing]\n' +
    'NEXT\n  Core: Joint route [if pricing and groups]\n  Growth: Either experiment [if pricing or groups]\n' +
    'LATER\n  Core: Fixed-fee route [unless pricing]\n  Growth: Historical launch [if settled] [done]';
  const pathsModel = parsePaths(source);
  const pathsProjected = projectPaths(pathsModel, '2026-08-11');
  const pathsOverview = overviewProjection(pathsProjected);
  const impact = decisionImpactProjection(pathsModel, pathsProjected, 'pricing');
  const pathsCtx = {...ctxBase, selectedKey:'pricing', impact};
  variants['paths-overview'] = renderOverview(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-overview-narrow'] = renderOverviewNarrow(pathsOverview, {...pathsCtx, width:390});
  variants['paths-question'] = renderQuestionLens(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-question-narrow'] = renderQuestionLensNarrow(pathsOverview, {...pathsCtx, width:390});
  variants['paths-conditions'] = renderConditions(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-conditions-narrow'] = renderConditionsNarrow(pathsOverview, {...pathsCtx, width:390});
  const pathsAgenda = learningAgendaProjection(pathsModel, pathsProjected);
  variants['paths-agenda'] = renderLearningAgenda(pathsAgenda, {...pathsCtx, width:1160, selection:false});
  variants['paths-agenda-narrow'] = renderLearningAgendaNarrow(pathsAgenda, {...pathsCtx, width:390, selection:false});
  /* Dependencies is deliberately a selected-decision lens rather than an all-at-once
     graph. Pricing is third in source order here, pinning the focused-anchor behaviour
     alongside direct, AND, OR and negated work. */
  variants['paths-dependencies'] = renderDependencies(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-dependencies-narrow'] = renderDependenciesNarrow(pathsOverview, {...pathsCtx, width:390});
}

/* /proxy: full Hunt is intentionally unselected; receipt is the separately
   scoped artefact. Both wide and narrow pin theory/pattern separation. */
{
  const {parse:parseProxy} = await import('../proxy/parse.js');
  const {project:projectProxy} = await import('../proxy/project.js');
  const {fullHuntProjection} = await import('../proxy/export-projection.js');
  const {renderHunt, renderHuntNarrow, renderHuntReceipt} = await import('../proxy/render-hunt.js');
  const source = 'title: Lantern invite pressure\ndate: 2026-08-13\noutcome: Groups retain after week one\n' +
    'proxy: Invitation rate\naction: Prompt every active member\nmode: optimise\n' +
    'verdict: Keep invitation rate paired with seven-day invitee retention while this concern is tested.\nintended-theory:\n' +
    '  mechanism: A timely prompt helps a member invite a collaborator who returns\nprotects:\n  - New members retain trust\n' +
    'failure-theory fatigue:\n  mechanism: Repeated prompts pressure people into low-intent invitations\n' +
    '  harmed-outcome: New members retain trust\n  guardrail: Seven-day invitee retention\n' +
    '  basis: reasoned-mechanism\n  support: Support conversations show pressure is felt\n' +
    '  weaken-with: Matched cohorts show retained invitees do not fall\nreported-pattern:\n' +
    '  proxy-reading: Invitation rate rose from 11% to 19%\n  outcome: New members retain trust\n' +
    '  outcome-reading: Seven-day invitee retention fell from 42% to 35%\n' +
    '  population: New solo members\n  horizon: First seven days\n  comparator: Prior prompt\n  source: Lantern event readout';
  const model = parseProxy(source);
  const live = projectProxy(model, 'fatigue');
  const full = fullHuntProjection(model);
  variants['proxy-hunt'] = renderHunt(full, {...ctxBase, width:1160, interactive:false});
  variants['proxy-hunt-narrow'] = renderHuntNarrow(full, {...ctxBase, width:390, interactive:false});
  variants['proxy-hunt-receipt'] = renderHuntReceipt(live, {...ctxBase, width:900});
}

/* Presentation + page-set renderers (added 2026-08-16). These five were the only
   SVG-emitting renderers with no golden at all — every refactor touching them was
   unverifiable, which is the one job this corpus exists to do.

   The gap was smaller than it first looked. Ten renderers are unreachable from this
   file, but five of those emit HTML, not SVG (duel/render, gauge/render-form and all
   three premortem renderers) — an SVG corpus was never their gate; injection.test.mjs
   covers them as HTML surfaces. tree/render-density looked unreachable to a scan of
   import specifiers but is fully covered through the tree/render.js facade.

   renderChapterPages returns {plan, pages} rather than one string, so each page is
   pinned separately — the composition is the thing that breaks, so page count matters
   as much as page content, and a lost page shows up as a missing file.

   paths/render-learning-closeout was left out on 2026-08-16 as "needs closeOutFor()
   extracted from the DOM-bound app.js first". That was wrong, and checking rather than
   repeating it took one grep: closeOutFor is a two-line wrapper around
   projectLearningCloseOut, which paths/learning-closeout.js already exports and which
   has no DOM reference at all. The wrapper only supplies `today`, so the golden passes
   a fixed date and calls the projector directly. No product change was needed. */
{
  const {parse: bparse} = await import('../bets/parse.js');
  const {simulate: bsim} = await import('../bets/engine.js');
  const {renderBetsPresentation} = await import('../bets/render-presentation.js');
  const bdoc = 'title: Q3 bets\nunit: £k\n\nGrowth\n  Referral loop: stake 80, odds 40-60%, payoff 300-500\n    kill: signups per referral under 0.3 by 2026-09-15\n  Paid push: stake 220, odds 15-25%, payoff 150-300\nPlatform\n  Sync rewrite: stake 140, odds 55-70%, payoff 200-420';
  const bm = bparse(bdoc);
  variants['bets-presentation'] = renderBetsPresentation(bm, bsim(bm, {seed: 7}), {...ctxBase});
  variants['bets-presentation-dark'] = renderBetsPresentation(bm, bsim(bm, {seed: 7}), {...ctxDark});

  const {parse: mp} = await import('../map/parse.js');
  const {resolve: mz} = await import('../map/zones.js');
  const {readout: mro} = await import('../map/readout.js');
  const {renderMapPresentation} = await import('../map/render-presentation.js');
  const mdoc = 'preset: assumptions\ntitle: Launch assumptions\n\nReaders finish the first book @ 30,90 :: test: watch 5 sessions\nAbandoned books drive churn @ 75,80\nReaders pay for clubs @ 60,35';
  const mm = mp(mdoc);
  const mres = mz(mm);
  variants['map-presentation'] = renderMapPresentation(mm, mres, mro(mm, mres), {...ctxBase});
  variants['map-presentation-dark'] = renderMapPresentation(mm, mres, mro(mm, mres), {...ctxDark});
  const {mapDiff, mapDiffView} = await import('../map/diff.js');
  const plateBefore = mp('preset: assumptions\ntitle: Launch assumptions\nReaders finish the first book @ 20,90\nGone @ 70,20');
  const plateAfter = mp('preset: assumptions\ntitle: Launch assumptions\nReaders finish the first book @ 40,70\nNew evidence @ 70,20');
  const plateResolved = mz(plateAfter);
  variants['map-presentation-diff'] = renderMapPresentation(plateAfter, plateResolved, mro(plateAfter, plateResolved), {...ctxBase},
    mapDiffView(mapDiff(plateBefore, plateAfter), 'Prior review'));

  const {parse: wp} = await import('../why/parse.js');
  const {renderCausalPresentation: renderWhyPresentation} = await import('../why/causal-presentation.js');
  const wdoc = 'title: T\noutcome: Retention\n  Losing your place\n    Reading reminders [testing]\n    Resume where you left off [delivering]\n  Choosing is work';
  /* No date normaliser here, unlike the other why fixtures: ctxBase sets no `today`,
     and render-presentation emits String(ctx.today || '') — so there is no date to strip.
     A .replace() was written here first and did nothing. */
  variants['why-presentation'] = renderWhyPresentation(wp(wdoc), {...ctxBase});

  /* The close-out receipt: an answered decision carrying a nested `close-out:` block.
     `today` is injected (never Date.now()) so the elapsed/review-by wording is fixed. */
  const {parse: pp} = await import('../paths/parse.js');
  const {projectLearningCloseOut} = await import('../paths/learning-closeout.js');
  const {renderLearningCloseOut, renderLearningCloseOutNarrow} =
    await import('../paths/render-learning-closeout.js');
  const pdoc = 'title: Lantern routes\ndate: 2026-08-11\n' +
    'decision groups:\n  question: Do book clubs retain?\n  signal: week-four retention\n' +
    '  reading: 18%\n  owner: Growth\n  answer-by: 2026-09-10\n' +
    '  answer: yes 2026-09-08 -- cohort G-42\n' +
    '  close-out:\n    basis-kind: observation\n    carry-forward: scoped-finding\n' +
    '    decision-use: informs the Q4 route\n    claim: Clubs hold week-four retention\n' +
    '    scope: Pilot readers\n    review-by: 2026-10-31\n' +
    '    reconsider-if: The pattern reverses\n    next-check: Assigned variant\n' +
    'NOW\n  Growth: Invite prompt [doing] [if groups]';
  const pmodel = pp(pdoc);
  const pdec = pmodel.decisions[0];
  const preceipt = projectLearningCloseOut(pdec, '2026-09-20');
  variants['paths-learning-closeout'] =
    renderLearningCloseOut(pmodel, pdec, preceipt, {...ctxBase, width: 1160});
  variants['paths-learning-closeout-narrow'] =
    renderLearningCloseOutNarrow(pmodel, pdec, preceipt, {...ctxBase, width: 390});


  /* This legacy-named fixture also uses Chapter. Six horizons x five lanes
     pin balanced time-window pagination beyond the one-page threshold. */
  const rdoc = 'style: board\ntitle: Roadmap\nhorizons: ' + ['Q1','Q2','Q3','Q4','Q5','Q6'].join(', ') + '\n\n' +
    ['Q1','Q2','Q3','Q4','Q5','Q6'].map(h => h + '\n' +
      [1,2,3,4,5].map(i => 'Lane' + i + ': Item ' + h + '-' + i).join('\n')).join('\n\n');
  const deck = renderChapterPages(parse('date: 2026-09-04\n'+rdoc), {...ctxBase});
  deck.pages.forEach((page, i) => { variants['roadmap-deck-pages-' + i] = page; });
}

/* filenames under dev/golden with uncommitted changes (modified/deleted/untracked),
   or null if git can't be run. cwd-independent (worktree-safe) — resolves the
   repo root from this file, not process.cwd(). */
function dirtyGoldens(){
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', 'dev/golden'], {encoding: 'utf8'});
  if(r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout.split('\n').filter(Boolean).map(l => l.slice(3).replace(/^dev\/golden\//, ''));
}

const mode = process.argv[2];   // capture | compare | verify (compare + assert committed)
const prefix = process.argv[3]; // optional narrow capture, e.g. `timeline`
mkdirSync(new URL('./golden/', import.meta.url), {recursive: true});
let fails = 0;
for(const [k, svg] of Object.entries(variants)){
  if(prefix && !k.startsWith(prefix + '-')) continue;
  const file = new URL('./golden/' + k + '.svg', import.meta.url);
  if(mode === 'capture'){
    writeFileSync(file, svg);
    console.log('captured ' + k + ' (' + svg.length + ' chars)');
  } else {
    const want = readFileSync(file, 'utf8');
    if(want === svg) console.log('IDENTICAL ' + k);
    else { console.log('DIFFERS ' + k + ' (' + want.length + ' -> ' + svg.length + ')'); fails++; }
  }
}

/* uncommitted-golden guard (the why-map incident): a `capture` writes to
   dev/golden, so `compare` can pass "IDENTICAL" against edits you never
   committed — a false green that only CI (clean checkout) would catch, and only
   post-merge. `compare` warns loudly at the tail (where the eye lands after the
   IDENTICAL wall); `verify` hard-fails, and is what the pre-merge runner invokes. */
if(mode === 'compare' || mode === 'verify'){
  const dirty = dirtyGoldens();
  if(dirty === null){
    if(mode === 'verify'){ console.error('\ngolden verify: could not run git to check for uncommitted goldens — failing closed.'); process.exit(1); }
    // compare: don't break the dev loop over a missing/again git
  } else if(dirty.length){
    console.error('\nWARNING: ' + dirty.length + ' golden file(s) uncommitted (' + dirty.join(', ') +
      ') — an "IDENTICAL" pass compared against your working-tree edits, NOT committed state.' +
      '\nCommit or revert them before merging (a delegating tool’s goldens shift when a shared renderer changes).');
    if(mode === 'verify') fails++;
  }
}
process.exit(fails ? 1 : 0);
