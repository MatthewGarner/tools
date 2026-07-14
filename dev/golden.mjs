/* Golden-output harness: renders fixed models through render.js and writes/compares
   exact SVG strings. Usage: node dev/golden.mjs capture|compare|verify
   - compare: byte-identical check, warns if dev/golden has uncommitted changes
   - verify : compare AND assert dev/golden is fully committed (pre-merge gate) */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from '../roadmap/parse.js';
import {render} from '../roadmap/render.js';

const ctxBase = {
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
    statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}, accentInk:'#0A6C94'},
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
  /* narrow (phone) relayout, edit:true — the only real-world path (exports
     never set ctx.width): plain no-lanes stack, lane sub-labels + certainty
     fade + status pills, and the diff strip's single-column dropped list. */
  variants['roadmap-narrow'] = render(parse(docs.nolanes), {...ctxBase, edit: true, width: 360});
  variants['roadmap-narrow-lanes'] = render(m, {...ctxBase, edit: true, width: 360});
  variants['roadmap-narrow-diff'] = render(m, {...ctxBase, edit: true, width: 360, diff: {
    badge: it => it.title === 'Smart reminders' ? {kind:'new', label:'New'} :
                 it.title === 'Referral flow' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
    since: '2026-06-01', any: true,
  }});
}

/* deck exports (roadmap/render-deck.js) — a separate module from render.js
   (the whole containment story: /why delegates to render.js, never to the
   deck). `date:` is fixed in the doc, so the capture is deterministic without
   needing ctx.today at all. */
{
  const {renderDeck} = await import('../roadmap/render-deck.js');
  variants['deck-board'] = renderDeck(parse(docs.lanes), {...ctxBase});
  /* the flipped-to-list rendering path (a distinct code path from card
     columns — the prototype's version of this had no cap and overflowed the
     frame, which is exactly what this golden pins down). */
  const listDoc = 'title: Portfolio board\ndate: 2026-07-04\nNOW\n' +
    Array.from({length: 24}, (_, i) => (i % 3 === 0 ? 'Core: ' : i % 3 === 1 ? 'Growth: ' : 'Platform: ') +
      'Item number ' + i + (i % 5 === 0 ? ' [risk]' : i % 7 === 0 ? ' [blocked]' : '') +
      (i % 4 === 0 ? ' -- a short note on this one' : '')).join('\n') +
    '\nNEXT\nCore: placeholder\nLATER\nCore: placeholder';
  variants['deck-board-list'] = renderDeck(parse(listDoc), {...ctxBase});

  /* REGISTER: badges (NEW capsule + "was X" italic horizon cell) + dropped
     rows (struck, DROPPED capsule) — the formal-table diff read. Also the one
     fixture carrying an AUTHORED `headline:`, so the standfirst (and the body
     band it pushes down) stays pinned; the others prove the no-headline frame. */
  const registerDoc = 'title: Portfolio register\nstyle: register\ndate: 2026-07-04\n' +
    'headline: We are consolidating — three bets, no more\nNOW\n' +
    'Core: Streak freeze [doing] -- shipping soon\n' +
    'Growth: Referral flow [risk] -- needs legal review\n' +
    'Platform: Billing migration [blocked] -- waiting on vendor\n' +
    'NEXT\nCore: Smart reminders\nGrowth: Onboarding v2\n' +
    'LATER\nGrowth: Coach marketplace [done]';
  const registerDiff = {
    any: true, since: '2026-06-01',
    badge: it => it.title === 'Smart reminders' ? {kind: 'new', label: 'New'} :
                 it.title === 'Referral flow' ? {kind: 'moved', label: 'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
  };
  variants['deck-register-diff'] = renderDeck(parse(registerDoc), {...ctxBase, diff: registerDiff});

  /* FOCUS: an over-WIP Now (which the deck must NOT editorialise about — the
     breach is an editor warning, never a line on the slide) with enough items
     to force the 2-column hero (>=6) and a faded ranked rail. */
  const focusDoc = 'title: Product roadmap\nstyle: focus\ndate: 2026-07-04\nwip: 6\nNOW\n' +
    Array.from({length: 8}, (_, i) => (['Core', 'Growth', 'Platform'][i % 3]) + ': Item number ' + i +
      (i % 3 === 0 ? ' -- a short supporting note' : '') +
      (i === 2 ? ' [risk]' : i === 5 ? ' [blocked]' : '')).join('\n') +
    '\nNEXT\nCore: Next horizon item one\nGrowth: Next horizon item two\n' +
    'LATER\nCore: Later horizon item';
  variants['deck-focus'] = renderDeck(parse(focusDoc), {...ctxBase});

  /* GRID: a quarterly (time-axis) doc — style: grid is also the DEFAULT here
     (no style: line needed) since genHorizons sets model.timeAxis. */
  variants['deck-grid'] = renderDeck(parse(docs.quarterly), {...ctxBase});
}

/* tree fixtures (dates normalised so captures are stable) */
{
  const {parse: tparse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render: trender, treeVerdict} = await import('../tree/render.js');
  const bid = 'title: T\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';
  const m = tparse(bid);
  const r = evaluate(m);
  variants['tree-bid'] = trender(m, r, {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['tree-bid-slide'] = trender(m, r, {...ctxBase, slide: true}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');

  const {posterSvg: treePoster} = await import('../assets/poster.js');
  const leaves = (function countLeaves(n){ return n.children.length === 0 ? 1 : n.children.reduce((a, c) => a + countLeaves(c), 0); })(m.root);
  variants['tree-poster'] = treePoster({
    chart: trender(m, r, {...ctxBase, slide: true, bare: true}),
    verdict: treeVerdict(m, r), name: m.title || 'Decision tree', date: '2026-07-14',
    metrics: [
      ...(m.root.kind === 'decision' ? [m.root.children.length + ' options'] : []),
      leaves + ' outcomes'],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'},
    measure: ctxBase.measure});
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

  /* narrow (phone) relayout, edit:true — the only real-world path (exports
     never set ctx.width): the indented outline (OST) and its map-view
     inheritance of roadmap's narrow relayout (Task 2). */
  variants['why-ost-narrow'] = norm(renderOst(m, pr, {...ctxBase, edit: true, width: 360}));
  variants['why-map-narrow'] = norm(renderMap(m, pr, {...ctxBase, edit: true, width: 360}));

  /* multi-outcome map-view narrow fixture: every single-outcome fixture above
     hid the dropped-band-header regression (a lone laneGroup still reads fine
     without a heading) — two outcomes prove the fix actually distinguishes
     which lanes belong to which outcome on a phone. */
  const multiDoc = 'title: H2 product bets\noutcome: Improve 90-day retention\n  Users forget mid-afternoon habits\n' +
    '    Smart reminders [testing]\n      ? users want interruptions\noutcome: Grow referral revenue\n' +
    '  Sharing feels braggy\n    Private progress cards [delivering]\n      ? cards get shared [testing]\n' +
    '  No reason to invite others\n';
  const mm = wparse(multiDoc);
  const mpr = project(mm);
  variants['why-map-narrow-multi'] = norm(renderMap(mm, mpr, {...ctxBase, edit: true, width: 360}));

  /* deep-tree fixture (#4-5 levels of freely-nesting opportunities down to a
     solution): proves the depth clamp — depths 3, 4 and 5 all share the
     depth-3 indent/card width instead of collapsing or running off-screen. */
  const deepDoc = 'title: Deep chain\noutcome: Grow retention\n  Users forget mid-afternoon habits\n' +
    '    Notifications feel spammy\n      Users mute after first week\n        Frequency too high\n' +
    '          Smart batching [testing]\n            ? batching preserves timing';
  const dm = wparse(deepDoc);
  const dpr = project(dm);
  variants['why-ost-narrow-deep'] = norm(renderOst(dm, dpr, {...ctxBase, edit: true, width: 360}));
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

  const {posterSvg: mapPoster} = await import('../assets/poster.js');
  const pm = mparse(mdocs['map-assumptions']);
  const pr = mresolve(pm);
  const pro = mreadout(pm, pr);
  variants['map-poster'] = mapPoster({
    chart: norm(mrender(pm, pr, pro, {...ctxBase, slide: true, bare: true})),
    verdict: pro.verdict, name: pm.title || 'Map', date: '2026-07-14',
    metrics: [pm.items.length + ' items', ...(pro.flagged.length ? [pro.flagged.length + ' flagged'] : []),
              ...(pro.unplaced.length ? [pro.unplaced.length + ' unplaced'] : [])],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'},
    measure: ctxBase.measure});
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
  const mc = gparse('title: Feature bets\nnames: on\nPick the Q3 bet :: chips Streak overhaul | Social feed | Onboarding polish');
  const cresp = [{values: [[50, 30, 20]], name: 'Ana'}, {values: [[45, 35, 20]], name: 'Ben'},
    {values: [[40, 35, 25]], name: 'Cy'}, {values: [[0, 100, 0]], name: 'Di'}];
  variants['gauge-overlay-chips'] = grender(mc, gstats(mc, cresp), {...ctxBase});
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

  const {posterSvg} = await import('../assets/poster.js');
  const {timelineReadout} = await import('../timeline/render.js');
  const tPosterCtx = {...tctx, slide: true, bare: true, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'}};
  variants['timeline-poster'] = posterSvg({chart: trender(tm, tPosterCtx),
    verdict: timelineReadout(tm, 20640), name: 'T — programme', date: '2026-07-13',
    metrics: ['4 milestones', 'last by Jun 2027'],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'}, measure: ctxBase.measure});
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

  const {posterSvg: rPoster} = await import('../assets/poster.js');
  const rFi = focusedIndex(rs.rows, null);
  const rRow = rs.rows[rFi];
  variants['risk-poster'] = rPoster({
    chart: rrender(rm, rs, {...ctxBase, slide: true}, {bare: true}),
    verdict: riskVerdict(rs, rm, null), name: rm.title || 'Risk transfer', date: '2026-07-14',
    metrics: [rs.rows.length + ' structures', rRow.label + ' P50 ' + rFmtUnit(rRow.p50, rm.unit)],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'},
    measure: ctxBase.measure});
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
  const cg = cparse(cdoc.replace('second: 35..60%\n', '').replace('augment: 120..180 £/kWh\n', ''));
  variants['cycles-ghosts'] = crender(cg, csim(cg, {seed: 1, n: 2000}), {...ctxBase}, {edit: true});

  const {posterSvg: cPoster} = await import('../assets/poster.js');
  variants['cycles-poster'] = cPoster({
    chart: crender(cm, co, {...ctxBase, slide: true}, {bare: true}),
    verdict: cVerdict('threshold', co), name: cm.title || 'Cycle budget', date: '2026-07-14',
    metrics: [cm.battery.mw + 'MW / ' + cm.battery.mwh + 'MWh',
              cFmtUnit(co.threshold.p50, '£/MWh') + ' τ',
              Math.round(co.threshold.clearingDays) + ' days/yr clear'],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'},
    measure: ctxBase.measure});
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

  const {posterSvg: moPoster} = await import('../assets/poster.js');
  const {buildVerdict: moVerdict} = await import('../energy/merit-order/render.js');
  const {dispatch: moDispatch} = await import('../energy/merit-order/engine.js');
  const moState = mk(DEFAULT_PARAMS);
  const moResult = moDispatch(moState.generators, moState.demand);
  const moBare = renderStack(moState, mctx, {forExport: true, labelCollide: 'drop', bare: true});
  const moFull = moVerdict(moResult, moState);
  variants['merit-order-poster'] = moPoster({chart: moBare, verdict: (moFull.match(/^.*?\.(?=\s|$)/) || [moFull])[0],
    name: 'Merit order', date: '2026-07-13',
    metrics: ['clears £' + Math.round(moResult.clearingPrice) + '/MWh', 'demand ' + moState.demand + ' GW'],
    accent: '#C05621', colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'}, measure: ctxBase.measure});
}

/* /intraday fixtures (deterministic by construction) */
{
  const {runDay, DAY_DEFAULTS} = await import('../energy/intraday/day.js');
  const {renderDay} = await import('../energy/intraday/render-day.js');
  const {MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const ictx = {width: 900, height: 420, palette: MERIT_PALETTE.light,
    colors: {ink: '#1b2733', muted: '#66727e', accent: '#C05621', grid: '#e3e7ea', card: '#ffffff'}};
  const pFleet = {...DAY_DEFAULTS, fleetGW: 6};
  variants['intraday-raw'] = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ictx, {forExport: true});
  variants['intraday-fleet'] = renderDay(runDay(pFleet), pFleet, ictx, {forExport: true});
  variants['intraday-fleet-narrow'] = renderDay(runDay(pFleet), pFleet, {...ictx, width: 360}, {forExport: true});
}

/* /wardley fixtures (pure layout → deterministic) */
{
  const {parse: wparse} = await import('../wardley/parse.js');
  const {layoutMap} = await import('../wardley/layout.js');
  const {renderMap: wrender, mapReadout} = await import('../wardley/render.js');
  const wdoc = 'title: Habitat platform\nanchor: Habit tracking\n' +
    'Streak engine @ custom\nNotification service @ product\nUser DB @ commodity\nPush gateway\n' +
    'Habit tracking -> Streak engine -> Notification service -> Push gateway\nStreak engine -> User DB';
  const wPrev = wdoc.replace('Streak engine @ custom', 'Streak engine @ 0.30')
    .replace('\nUser DB @ commodity', '\nUser DB @ commodity\nOld cache @ product')
    .replace('Streak engine -> User DB', 'Streak engine -> User DB\nStreak engine -> Old cache');
  const wctx = {...ctxBase, palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8']};
  const wm = wparse(wdoc);
  variants['wardley-map'] = wrender(wm, layoutMap(wm), wctx);
  variants['wardley-compare'] = wrender(wm, layoutMap(wm), wctx,
    {compare: {prev: wparse(wPrev), label: 'March'}});
  variants['wardley-narrow'] = wrender(wm, layoutMap(wm), {...wctx, width: 390});
  variants['wardley-edit'] = wrender(wm, layoutMap(wm), wctx, {edit: true});
  variants['wardley-narrow-edit'] = wrender(wm, layoutMap(wm), {...wctx, width: 390}, {edit: true});

  const {posterSvg: wPoster} = await import('../assets/poster.js');
  const wComps = layoutMap(wm).nodes.filter(n => !n.anchor);
  const wGhosts = wComps.filter(n => n.ghost).length;
  variants['wardley-poster'] = wPoster({
    chart: wrender(wm, layoutMap(wm), wctx, {bare: true}),
    verdict: mapReadout(wm, layoutMap(wm)).verdict, name: wm.title || 'Wardley map', date: '2026-07-14',
    metrics: [wComps.length + ' components', wm.edges.length + ' dependencies',
              ...(wGhosts ? [wGhosts + ' unplaced'] : [])],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'},
    measure: ctxBase.measure});
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

  const {posterSvg: betsPoster} = await import('../assets/poster.js');
  const {verdictCopy: betsVerdict} = await import('../bets/engine.js');
  const bCounts = {kill: 1};
  variants['bets-poster'] = betsPoster({chart: renderBoard(bm, bsim, {...ctxBase, bare: true}),
    verdict: betsVerdict(bsim.portfolio, bCounts), name: 'Q3 product portfolio', date: '2026-07-13',
    metrics: ['net EV ' + Math.round(bsim.portfolio.p50), 'P(loses) ' + Math.round(bsim.portfolio.pLoss * 100) + '%'],
    accent: ctxBase.colors.accent, colors: {...ctxBase.colors, grid: 'rgba(70,110,140,.10)'}, measure: ctxBase.measure});

  /* view 2: risk-return quadrant (read-only; no compare wiring) */
  const {renderQuadrant} = await import('../bets/render-quadrant.js');
  variants['bets-quadrant'] = renderQuadrant(bm, bsim, ctxBase);
  variants['bets-quadrant-narrow'] = renderQuadrant(bm, bsim, {...ctxBase, width: 390});

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

/* /alarm fixtures (pure numeric params → deterministic) */
{
  const {renderDistributions} = await import('../alarm/render.js');
  variants['alarm-dist'] = renderDistributions({baseRate: 0.02, dprime: 2, t: 1.2}, ctxBase.colors, {w: 900, h: 220});
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
