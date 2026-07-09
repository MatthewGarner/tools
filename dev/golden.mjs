/* Golden-output harness: renders fixed models through render.js and writes/compares
   exact SVG strings. Usage: node dev/golden.mjs capture|compare */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {parse} from '../roadmap/parse.js';
import {render} from '../roadmap/render.js';

const ctxBase = {
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'}},
  measure: (t) => t.length * 7,
};
const docs = {
  lanes: 'title: T\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- note here\nGrowth: Referral flow [risk]\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace [done]',
  nolanes: 'date: 2026-07-04\nNOW\nplain item\nNEXT\nanother much longer item title that wraps across lines for sure definitely',
  quarterly: 'title: Q\ndate: 2026-07-04\nhorizons: quarterly from Q3 2026 x5\nwip: off\nfade: off\nQ3 2026\nA: one\nQ1 2027\nB: two',
};
const variants = {};
for(const [k, src] of Object.entries(docs)){
  const m = parse(src);
  variants[k] = render(m, {...ctxBase});
  variants[k + '-slide'] = render(m, {...ctxBase, slide: true});
}
{
  const m = parse(docs.lanes);
  variants['lanes-diff'] = render(m, {...ctxBase, diff: {
    badge: it => it.title === 'Smart reminders' ? {kind:'new', label:'New'} :
                 it.title === 'Referral flow' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
    since: '2026-06-01', any: true,
  }});
}

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
}

/* /why fixtures (dates normalised) */
{
  const {parse: wparse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const doc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Smart reminders [testing]\n      ? wanted\n    Streak freeze [delivering]\n      ? works [holds]\n  Chores feeling\n  Orphan [delivering]';
  const m = wparse(doc);
  const pr = project(m);
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['why-ost'] = norm(renderOst(m, pr, {...ctxBase}));
  const {whyDiff, whyDiffView} = await import('../why/diff.js');
  const oldDoc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Smart reminders [candidate]\n      ? wanted\n  Chores feeling\n    Old idea [parked]';
  const wd = whyDiffView(whyDiff(wparse(oldDoc), m), 'SNAP');
  variants['why-ost-diff'] = norm(renderOst(m, pr, {...ctxBase}, wd));
  variants['why-map'] = norm(renderMap(m, pr, {...ctxBase}));
  variants['why-map-slide'] = norm(renderMap(m, pr, {...ctxBase, slide: true}));
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
  variants['map-diff'] = norm(mrender(curMap, rr, mreadout(curMap, rr), {...ctxBase}, md));
  variants['map-assumptions-slide'] = mk(mdocs['map-assumptions'], {slide: true});
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
  const agree = [{values: [[4, 8]]}, {values: [[5, 9]]}, {values: [[3, 7]]}];
  const m2 = gparse('Weeks :: range weeks');
  variants['gauge-overlay-agree'] = grender(m2, gstats(m2, agree), {...ctxBase});
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
  const {renderBatch, renderTriage} = await import('../flow/render.js');
  const fctx = {...ctxBase, colors: {...ctxBase.colors, track: '#edf0ee'}};
  const econP = {demandPerWeek: 3, transactionCost: 1000, holdCostPerItemWeek: 500, currentBatch: 8, maxBatch: 30};
  variants['flow-batch'] = renderBatch(batchEconomics(econP), econP, fctx);
  const healthyP = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  const overP = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  variants['flow-triage-drain'] = renderTriage(leverTriage(overP, {initialBacklog: 20}), overP, 20, fctx);
  variants['flow-triage-lead'] = renderTriage(leverTriage(healthyP, {initialBacklog: 0}), healthyP, 0, fctx);
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
  variants['timeline-slide'] = trender(tm, {...tctx, slide: true});
  variants['timeline-diff'] = trender(tm, tctx,
    timelineDiffView(timelineDiff(tparse(tOld), tm), 'JUNE PACK'));
}

/* /risk fixtures (seeded engine → deterministic) */
{
  const {parse: rparse} = await import('../energy/risk/parse.js');
  const {simulate} = await import('../energy/risk/engine.js');
  const {render: rrender} = await import('../energy/risk/render.js');
  const rdoc = 'title: Route to market — Wexcombe 100MW/2h\nmerchant: 60..180\n' +
    'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
  const rm = rparse(rdoc);
  const rs = simulate(rm);
  variants['risk-routes'] = rrender(rm, rs, {...ctxBase});
  variants['risk-routes-slide'] = rrender(rm, rs, {...ctxBase, slide: true});
  variants['risk-routes-narrow'] = rrender(rm, rs, {...ctxBase, width: 360});
  variants['risk-routes-focus'] = rrender(rm, rs, {...ctxBase}, {edit: true, focus: 2});
}

/* /cycles fixtures (seeded engine → deterministic; n reduced for capture speed) */
{
  const {parse: cparse} = await import('../energy/cycles/parse.js');
  const {simulate: csim} = await import('../energy/cycles/engine.js');
  const {render: crender} = await import('../energy/cycles/render.js');
  const cdoc = 'title: Cycle budget — Wexcombe 100MW/2h\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%';
  const cm = cparse(cdoc);
  const co = csim(cm, {seed: 1, n: 2000});
  variants['cycles-full'] = crender(cm, co, {...ctxBase});
  variants['cycles-full-slide'] = crender(cm, co, {...ctxBase, slide: true});
  variants['cycles-full-narrow'] = crender(cm, co, {...ctxBase, width: 360});
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
  const {DEFAULT_PARAMS, paramsFor} = await import('../energy/merit-order/scenarios.js');
  const mctx = {...ctxBase, palette: MERIT_PALETTE.light};
  const mk = p => ({generators: buildStack(p), demand: p.demand});
  variants['merit-order-typical'] = renderStack(mk(DEFAULT_PARAMS), mctx, {forExport: true});
  variants['merit-order-typical-narrow'] = renderStack(mk(DEFAULT_PARAMS), {...mctx, width: 360}, {forExport: true});
  variants['merit-order-negative'] = renderStack(mk(paramsFor('negative')), mctx, {forExport: true});
}

const mode = process.argv[2];
mkdirSync(new URL('./golden/', import.meta.url), {recursive: true});
let fails = 0;
for(const [k, svg] of Object.entries(variants)){
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
process.exit(fails ? 1 : 0);
