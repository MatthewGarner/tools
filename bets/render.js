/* Pure model + sim → Allocation Field. Wide is a shared exposure ledger;
   narrow is a menu-first register. Compare data is precomputed in app.js. */
import {esc, txt, tint, editTarget, btnAttrs} from '../assets/svg.js';
import {betKey} from './diff.js';
import {boardPlan, conditionReadings, measuredLines} from './layout.js';

const WIDE = 1240;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const r2 = n => Math.round(n * 100) / 100;
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const recOf = (sim, b) => sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: [], scoreable: false};
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
/* portfolio-level concentration honesty note — null when no bet reaches the
   engine's ≥40%-of-total-stake threshold, so callers reserve no gap for it */
const concentrationLine = conc => !conc ? null :
  '⚑ ' + conc.name + ' is ' + Math.round(conc.share * 100) + '% of total stake — one bet carries the book.';

const lossPct = pf => pf ? Math.round((pf.pLoss || 0) * 100) : null;
const outcomeText = pf => pf ? 'MEDIAN OUTCOME ' + sgn(pf.p50) + ' · P10 ' + sgn(pf.p10) + ' · P90 ' + sgn(pf.p90) : 'NOT AVAILABLE';
const menuFacts = b => ' data-name-raw="' + esc(b.name) + '" data-stake-raw="' + esc(rng(b.stake)) +
  '" data-odds-raw="' + esc(pct(b.odds)) + '" data-payoff-raw="' + esc(rng(b.payoff)) + '"';

/* The paired condition receipt is the board's thesis. It deliberately owns no
   surface of its own: the comparison is typography and a rule, not two tiles. */
function conditionCards(readings, x0, y0, width, c, narrow){
  const gap = narrow ? 10 : 18, receiptW = (width - gap) / 2, h = narrow ? 92 : 70;
  const out = [];
  [readings.baseline, readings.stress].forEach((item, i) => {
    const x = x0 + i * (receiptW + gap), pf = item.result, pl = lossPct(pf);
    const tone = pl != null && pl >= 50 ? c.err : c.accentInk;
    const px = narrow ? 0 : 10;
    out.push('<g data-condition-receipt="" data-condition="' + item.key + '">');
    if(i) out.push('<line x1="' + r2(x - gap / 2) + '" y1="' + r2(y0 + 2) + '" x2="' + r2(x - gap / 2) +
      '" y2="' + r2(y0 + h - 2) + '" stroke="' + c.border + '" stroke-width="1"/>');
    out.push(txt(x + px, y0 + 14, item.label.toUpperCase(), narrow ? 8.2 : 9, c.muted,
      {weight: 700, tracking: narrow ? '0.035em' : '0.07em'}));
    out.push(txt(x + px, y0 + (narrow ? 35 : 37), pl == null ? 'P(LOSES MONEY) —' : 'P(LOSES MONEY) ' + pl + '%',
      narrow ? 13 : 15, tone, {weight: 700, mono: true}));
    out.push(txt(x + px, y0 + (narrow ? 53 : 55), outcomeText(pf), narrow ? 8.6 : 9.2, c.ink, {weight: 600, mono: true}));
    const copyLines = measuredLines(item.condition, (narrow ? '8.5px ' : '8.8px ') + SANS, receiptW - px - 4,
      s => String(s).length * (narrow ? 4.3 : 4.5));
    copyLines.slice(0, narrow ? 2 : 1).forEach((line, li) => out.push(txt(x + px,
      y0 + (narrow ? 71 : 68) + li * (narrow ? 11 : 10), line, narrow ? 8.5 : 8.8, c.muted)));
    out.push('</g>');
  });
  return {parts: out, height: h};
}

export function renderBoard(model, sim, ctx = {}){
  return (!!ctx.width && ctx.width < 520) ? renderNarrow(model, sim, ctx) : renderWide(model, sim, ctx);
}

/* shared inputs both layouts need */
function prep(model, sim){
  const flat = [];
  for(const g of model.groups) for(const b of g.bets) flat.push(b);
  const scoreable = flat.filter(b => recOf(sim, b).scoreable !== false);
  const flagged = scoreable.filter(b => recOf(sim, b).audits.length).length;
  const totalStake = scoreable.reduce((t, b) => t + stakeMid(b), 0);
  let elo = 0, ehi = 1;
  for(const b of scoreable){ const e = recOf(sim, b).ev; elo = Math.min(elo, e.p10); ehi = Math.max(ehi, e.p90); }
  const epad = (ehi - elo) * 0.05 || 1;
  return {flat, scoreable, flagged, totalStake, elo: elo - epad, ehi: ehi + epad, pf: sim.portfolio, conc: sim.concentration};
}

/* killed bets grouped by the lane they lived in at snapshot time (case-
   insensitive on the group name) — so a ghost row lands "in its lane" when
   that lane still exists, and callers can still find the leftovers whose
   whole lane is gone (a group renamed or deleted entirely) to render as a
   trailing ghost lane rather than silently dropping them. */
function killedByGroup(compare){
  const map = new Map();
  if(!compare) return map;
  for(const b of compare.killed){
    const gname = (b.group || '').trim();
    const k = gname.toLowerCase();
    if(!map.has(k)) map.set(k, {name: gname, bets: []});
    map.get(k).bets.push(b);
  }
  return map;
}

/* Audits remain urgent through wording and one semantic colour—not badges. */
function stampRow(parts, audits, xRight, cy, c){
  audits.forEach((audit, i) => parts.push(txt(xRight, cy + i * 14, audit, 8.5, c.err,
    {weight: 700, anchor: 'end', tracking: '0.045em'})));
}

/* compare markers (NEW/KILLED): a small tinted, ruled tag — quieter than the
   rotated audit stamp (those shame a bet; these just report the diff).
   x is an edge; anchor 'start' reads left-to-right from it (used right after
   a name), 'end' reads right-to-left (used where audit stamps live). */
function pill(x, y, label, color, anchor = 'start'){
  const w = label.length * 6.0 + 16;
  const left = anchor === 'end' ? x - w : x;
  return '<rect x="' + r2(left) + '" y="' + r2(y - 10) + '" width="' + r2(w) + '" height="15" rx="0" fill="' +
    color + '" fill-opacity="0.1" stroke="' + color + '" stroke-width="1"/>' +
    txt(left + w / 2, y + 3.5, label, 8.5, color, {weight: 700, anchor: 'middle', tracking: '0.05em'});
}

/* ---------------- WIDE: the ledger ---------------- */
function renderWide(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const compare = ctx.compare || null, edit = !!ctx.edit;
  const {flat, flagged, totalStake, elo, ehi, pf, conc} = prep(model, sim);
  const conditions = conditionReadings(sim);
  const plan = boardPlan(model, sim, {measure});
  const pl = lossPct(pf);
  const concLine = concentrationLine(conc);
  /* Name, quote, exposure and audit annotation each own a non-overlapping
     region. Long names wrap inside nameEnd; the shared range is the visual
     anchor, not a miniature chart inside every row. */
  const C = {left: 40, id: 44, name: 84, nameEnd: 322,
    strip0: 334, stake: 410, odds: 500, payoff: 596, strip1: 620,
    p10: 704, p50: 774, p90: 844, bar0: 866, bar1: 1000,
    audit0: 1022, audit1: 1200, right: 1200};
  const ex = v => C.bar0 + (v - elo) / (ehi - elo || 1) * (C.bar1 - C.bar0);
  const parts = [], body = [];

  /* Header title owns a measured left rail. The condition receipt remains a
     separate right reading, so neither truncates authored source. */
  const titleLines = measuredLines(model.title || 'Bets board', '600 24px ' + SANS, 540, measure);
  titleLines.forEach((line, i) => parts.push('<text data-bets-title-line="" x="40" y="' + (48 + i * 26) +
    '" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="24" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>'));
  const strapY = Math.max(70, 48 + (titleLines.length - 1) * 26 + 22);
  parts.push(txt(40, strapY, flat.length + ' POSITIONS · ' + model.groups.length + ' BOOKS · TOTAL STAKE ' + num(totalStake) + ' · ' + flagged + ' FLAGGED', 10, c.muted, {mono: true, tracking: '0.05em'}));
  const receipt = conditionCards(conditions, 610, 16, C.right - 610, c, false);
  parts.push(...receipt.parts);
  let panelTop = strapY + 42;
  if(compare){
    const compareLines = measuredLines(compare.headline, '700 11.5px ' + SANS, 540, measure);
    compareLines.forEach((line, i) => parts.push(txt(40, strapY + 36 + i * 15, line, 11.5, c.accentInk, {weight: 700, tracking: '0.01em'})));
    panelTop = strapY + 36 + compareLines.length * 15 + 1;
  }

  // column heads
  const colHeadY = panelTop + 26;
  for(const [s, x, a] of [['POSITION', C.left, 'start'], ['STAKE', C.stake, 'end'], ['ODDS', C.odds, 'end'],
    ['PAYOFF', C.payoff, 'end'], ['EV P10', C.p10, 'end'], ['P50', C.p50, 'end'], ['P90', C.p90, 'end']])
    body.push(txt(x, colHeadY, s, 9, c.muted, {weight: 700, tracking: '0.08em', anchor: a}));
  body.push(txt((C.bar0 + C.bar1) / 2, colHeadY, 'P10 ▸ P90', 9, c.muted, {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  body.push(txt((C.audit0 + C.audit1) / 2, colHeadY, 'AUDIT NOTE', 9, c.muted,
    {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  body.push('<line x1="' + C.left + '" y1="' + (colHeadY + 9) + '" x2="' + C.right + '" y2="' + (colHeadY + 9) + '" stroke="' + c.ink + '" stroke-width="1.5" stroke-opacity="0.8"/>');

  const killedMap = killedByGroup(compare), usedKilledKeys = new Set();
  /* a ghost row for a killed bet: same column rhythm as a live row so it
     scans in place, but muted/dashed/struck and un-editable — its srcLine
     points into the SNAPSHOT source, not this editor, so no edit hooks. */
  function pushGhostRow(b){
    const lines = measuredLines(b.name, '600 13px ' + SANS, C.nameEnd - C.name, measure);
    const rowH = Math.max(42, 16 + lines.length * 16);
    body.push('<rect x="' + C.left + '" y="' + y + '" width="' + (C.right - C.left) + '" height="' + rowH +
      '" fill="' + c.muted + '" fill-opacity="0.035" stroke="' + c.border + '" stroke-width="1" stroke-dasharray="4 3"/>');
    lines.forEach((line, i) => body.push(txt(C.name, y + 20 + i * 16, line, 13, c.muted, {weight: 600, strike: true})));
    body.push(txt(C.stake, y + 22, rng(b.stake), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(txt(C.odds, y + 22, pct(b.odds), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(txt(C.payoff, y + 22, rng(b.payoff), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(pill(C.audit1 - 8, y + 18, 'KILLED', c.muted, 'end'));
    y += rowH;
    body.push('<line x1="' + C.left + '" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.border + '" stroke-width="0.75" stroke-dasharray="2 2"/>');
  }

  let y = colHeadY + 14;
  if(plan.mode === 'ledger'){
    body.push('<rect x="' + C.left + '" y="' + y + '" width="' + (C.right - C.left) + '" height="58" fill="' + c.accent + '" fill-opacity="0.07"/>');
    body.push(txt(C.left + 14, y + 23, 'PORTFOLIO LEDGER', 12, c.accentInk, {weight: 700, tracking: '0.12em'}));
    body.push(txt(C.left + 14, y + 45, 'TOTAL ' + flat.length + ' BETS · STAKE ' + num(totalStake) + ' · P50 ' + sgn(pf.p50) + ' · ' + flagged + ' FLAGGED',
      12, c.ink, {mono: true, weight: 700}));
    y += 72;
    body.push(txt(C.left, y, 'FULL BET REGISTER · SOURCE ORDER', 10, c.muted, {weight: 700, tracking: '0.1em'}));
    y += 14;
  }
  for(const g of model.groups){
    if(plan.mode === 'board'){
      body.push(txt(C.left, y + 17, g.name.toUpperCase(), 10, c.accentInk, {weight: 700, tracking: '0.14em'}));
      const gStake = g.bets.reduce((t, b) => t + stakeMid(b), 0);
      body.push(txt(C.right, y + 17, g.bets.length + ' POSITIONS · STAKE ' + num(gStake), 9, c.muted, {mono: true, anchor: 'end'}));
      y += 25;
    } else {
      body.push(txt(C.left, y + 14, g.name.toUpperCase(), 9.5, c.accentInk, {weight: 700, tracking: '0.12em'}));
      body.push(txt(C.right, y + 14, g.bets.length + ' POSITIONS', 8.5, c.muted, {mono: true, anchor: 'end'}));
      y += 20;
    }
    for(const b of g.bets){
      const rec = recOf(sim, b), e = rec.ev;
      const row = plan.byLine.get(b.srcLine);
      const bk = compare && betKey(b);
      const isNew = !!(compare && compare.newKeys.has(bk));
      const mvRaw = compare && compare.movedFields.get(bk);
      const mv = mvRaw && Object.keys(mvRaw).length ? mvRaw : null;
      const rowH = Math.max(row.height, mv ? 58 : 0);
      /* the row's own hit rect paints FIRST (behind the stake/odds/payoff/kill
         sub-targets that follow) so a click on one of THOSE still lands on
         its own data-edit target — this rect only catches the gaps. Painting
         it last (topmost) would swallow every click in the row, including
         ones meant for the smaller cells (roadmap's cardmenu row is the
         proven precedent for this ordering). */
      body.push('<g data-row="bet" data-id="' + row.id + '">');
      body.push(txt(C.id, y + row.nameTop, row.id, 9, plan.mode === 'ledger' ? c.accentInk : c.muted, {weight: 700, mono: true}));
      const nameY = y + row.nameTop;
      const nameTxt = row.nameLines.map((line, i) => txt(C.name, nameY + i * 16, line, 13, c.ink, {weight: 600})).join('');
      if(edit) body.push(editTarget(nameTxt,
        {x: C.name - 6, y: y + (plan.mode === 'ledger' ? 17 : 5), w: C.nameEnd - C.name + 8,
          h: Math.max(28, row.nameLines.length * 16 + 8), bg: c.bg},
        {kind: 'name', line: b.srcLine, raw: b.name, label: 'Rename: ' + b.name}));
      else body.push(nameTxt);
      if(isNew){
        // hug the first name line's end (mirrors the narrow card), clamped so a short
        // name doesn't strand the pill and a wrapped long name doesn't collide with it
        const nameW = measure(row.nameLines[0], '600 13px ' + SANS);
        body.push(pill(Math.min(C.name + nameW + 8, C.nameEnd - 40), y + 14, 'NEW', c.accentInk));
      }
      cell(body, C.stake, y + 4, rng(b.stake), e, c, {kind: 'stake', line: b.srcLine, raw: rng(b.stake)}, mv && mv.stake ? c.accentInk : null, edit);
      cell(body, C.odds, y + 4, pct(b.odds), e, c, {kind: 'odds', line: b.srcLine, raw: pct(b.odds)}, mv && mv.odds ? c.accentInk : null, edit);
      cell(body, C.payoff, y + 4, rng(b.payoff), e, c, {kind: 'payoff', line: b.srcLine, raw: rng(b.payoff)}, mv && mv.payoff ? c.accentInk : null, edit);
      if(rec.scoreable === false){
        body.push(txt(C.p50, y + 23, 'NOT SCORED', 11, c.err, {mono: true, anchor: 'end', weight: 700}));
        body.push(txt((C.bar0 + C.bar1) / 2, y + 23, 'Correct invalid or missing terms', 9, c.muted, {anchor: 'middle'}));
      } else {
      body.push(txt(C.p10, y + 23, sgn(e.p10), 12, e.p10 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      body.push(txt(C.p50, y + 23, sgn(e.p50), 12, e.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
      body.push(txt(C.p90, y + 23, sgn(e.p90), 12, e.p90 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      // one shared exposure scale: P10–P90 is a rule, P50 its precise notch
      const neg = e.p50 < 0;
      body.push('<line x1="' + C.bar0 + '" y1="' + (y + 18.5) + '" x2="' + C.bar1 + '" y2="' + (y + 18.5) + '" stroke="' + c.border + '" stroke-width="1"/>');
      body.push('<line data-exposure-range="" x1="' + r2(ex(e.p10)) + '" y1="' + (y + 18.5) + '" x2="' + r2(ex(e.p90)) + '" y2="' + (y + 18.5) + '" stroke="' + (neg ? c.err : c.accent) + '" stroke-width="4" stroke-opacity="0.7"/>');
      body.push('<line x1="' + r2(ex(0)) + '" y1="' + (y + 12) + '" x2="' + r2(ex(0)) + '" y2="' + (y + 25) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      body.push('<line data-exposure-median="" x1="' + r2(ex(e.p50)) + '" y1="' + (y + 12) + '" x2="' + r2(ex(e.p50)) + '" y2="' + (y + 25) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
      }
      // sub-line: kill "fold if" on the left (editable), moved values on the right
      if(b.kill){
        const killY = nameY + row.nameLines.length * 16 + 5;
        const inner = row.killLines.map((line, i) => txt(C.name, killY + i * 14, line, 10.5, c.muted)).join('');
        if(edit) body.push(editTarget(inner, {x: C.name - 4, y: r2(killY - 12), w: C.nameEnd - C.name + 6,
          h: row.killLines.length * 14 + 7, bg: c.bg},
          {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
        else body.push(inner);
      }
      if(mv){
        const wy = y + 43;
        if(mv.stake) body.push(txt(C.stake, wy, 'was ' + rng(mv.stake), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.odds) body.push(txt(C.odds, wy, 'was ' + pct(mv.odds), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.payoff) body.push(txt(C.payoff, wy, 'was ' + rng(mv.payoff), 9, c.muted, {mono: true, anchor: 'end'}));
      }
      if(rec.scoreable !== false) stampRow(body, rec.audits, C.audit1 - 52, y + 17, c);
      if(edit) body.push('<g data-edit="cardmenu" data-line="' + b.srcLine + '" data-menu=""' + menuFacts(b) + btnAttrs('More options: ' + b.name) + '>' +
        '<rect data-hit="" x="' + (C.right - 44) + '" y="' + y + '" width="44" height="44" fill="transparent"/>' +
        txt(C.right - 14, y + 27, '⋯', 14, c.muted, {weight: 700, anchor: 'middle'}) + '</g>');
      body.push('</g>');
      y += rowH;
      body.push('<line x1="' + C.left + '" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.border + '" stroke-width="0.75"/>');
    }
    const gk = g.name.trim().toLowerCase();
    if(killedMap.has(gk)){
      usedKilledKeys.add(gk);
      for(const kb of killedMap.get(gk).bets) pushGhostRow(kb);
    }
    if(plan.mode === 'board') y += 6;
  }
  for(const [gk, glane] of killedMap){
    if(usedKilledKeys.has(gk)) continue;
    body.push(txt(C.left, y + 17, (glane.name || 'REMOVED').toUpperCase(), 10, c.muted, {weight: 700, tracking: '0.14em'}));
    body.push(txt(C.right, y + 17, glane.bets.length + ' KILLED', 9, c.muted, {mono: true, anchor: 'end'}));
    y += 25;
    for(const kb of glane.bets) pushGhostRow(kb);
    y += 6;
  }

  // portfolio total
  y += 2;
  body.push('<line x1="' + C.left + '" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.ink + '" stroke-width="1.5" stroke-opacity="0.8"/>');
  body.push(txt(C.left, y + 24, 'PORTFOLIO — ' + flat.length + ' BETS', 10.5, c.ink, {weight: 700, tracking: '0.05em'}));
  body.push(txt(C.stake, y + 24, num(totalStake), 13, c.ink, {mono: true, anchor: 'end', weight: 700}));
  if(pf){
    body.push(txt(C.p10, y + 24, sgn(pf.p10), 13, pf.p10 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
    body.push(txt(C.p50, y + 24, sgn(pf.p50), 13, pf.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
    body.push(txt(C.p90, y + 24, sgn(pf.p90), 13, pf.p90 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  } else body.push(txt(C.p50, y + 24, 'NOT AVAILABLE · NO SCOREABLE BETS', 10, c.err, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.right, y + 24, flagged + ' FLAGGED', 9.5, flagged ? c.err : c.muted, {weight: 700, anchor: 'end', tracking: '0.05em'}));
  y += 40;

  // concentration honesty note — one line, only when the engine flags a bet
  if(concLine){
    body.push(txt(C.left, y + 12, concLine, 11.5, c.status.risk, {weight: 600}));
    y += 22;
  }

  // outcome rail
  y = outcomeRail(body, conditions, C.left, C.right, y, c, false, compare);
  const panelBot = y + 8;
  parts.push(...body);
  parts.push(txt(C.left, panelBot + 22, 'RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS · BOTH PORTFOLIO CONDITIONS SHOWN · AUDITS ARE FACTUAL NOTES', 9, c.muted, {tracking: '0.04em'}));
  parts.push(txt(C.right, panelBot + 22, 'ALL FIGURES ' + (model.unit || '').toUpperCase(), 9, c.muted, {anchor: 'end', tracking: '0.05em'}));

  const H = panelBot + 40;
  const stress = conditions.stress.result;
  return svgShell(WIDE, H, c, parts.join(''), false,
    model.title || 'Bets board',
    conditions.baseline.label + ': ' + (pf ? pl + '% lose money, median outcome ' + sgn(pf.p50) : 'not available') + '. ' +
    conditions.stress.label + ': ' + (stress ? lossPct(stress) + '% lose money, median outcome ' + sgn(stress.p50) : 'not available') + '.');
}

/* a right-aligned editable numeric cell (stake/odds/payoff); `tone` overrides
   the value's fill (compare mode: accent when this field moved since the
   snapshot) — omit/null for the default ink. */
function cell(body, x, y, str, e, c, hooks, tone, edit){
  const inner = txt(x, y + 19, str, 12, tone || c.ink, {mono: true, anchor: 'end'});
  if(edit) body.push(editTarget(inner, {x: r2(x - 64), y: r2(y + 2), w: 68, h: 26, bg: c.bg}, hooks));
  else body.push(inner);
}

function outcomeRail(body, conditions, x0, x1, y, c, narrow, compare){
  const pf = conditions.baseline.result;
  const stress = conditions.stress.result;
  if(!pf){
    body.push(txt(x0, y + 10, 'SIMULATED OUTCOMES · NOT AVAILABLE', 9, c.err,
      {weight: 700, tracking: '0.06em'}));
    body.push(txt(x0, y + 28, 'No scoreable bets — correct invalid or missing stake, odds and payoff terms.',
      narrow ? 9 : 10, c.muted));
    return y + 38;
  }
  const pl = lossPct(pf);
  const bins = pf.histogram || [[0, 1, 0]];
  const stressBins = stress && stress.histogram;
  const prevPf = compare && compare.prevSim && compare.prevSim.portfolio;
  const prevBins = prevPf && prevPf.histogram;
  /* one shared scale for both bands — the ghost must sit on the same ruler
     as the live one, or "drift" reads as noise instead of movement. */
  const hlo = Math.min(bins[0][0], 0, stressBins ? stressBins[0][0] : Infinity,
    prevBins ? prevBins[0][0] : Infinity);
  const hhi = Math.max(bins[bins.length - 1][1], 1,
    stressBins ? stressBins[stressBins.length - 1][1] : -Infinity,
    prevBins ? prevBins[prevBins.length - 1][1] : -Infinity);
  const rx = v => x0 + (v - hlo) / (hhi - hlo || 1) * (x1 - x0);
  if(narrow){                                              // stack — the two captions collide on a phone
    body.push(txt(x0, y + 6, 'INDEPENDENT OUTCOMES — 4,000 RUNS', 9, c.muted, {weight: 700, tracking: '0.06em'}));
    body.push(txt(x0, y + 20, pl + '% BELOW ZERO · MEDIAN ' + sgn(pf.p50), 9.5,
      pl >= 50 ? c.err : c.accentInk, {weight: 700, tracking: '0.04em'}));
    y += 18;
  } else {
    body.push(txt(x0, y + 10, 'INDEPENDENT BASELINE · 4,000 SEEDED RUNS', 9, c.muted, {weight: 700, tracking: '0.08em'}));
    body.push(txt(x1, y + 10, pl + '% BELOW ZERO · MEDIAN ' + sgn(pf.p50), 9,
      pl >= 50 ? c.err : c.accentInk, {weight: 700, tracking: '0.05em', anchor: 'end'}));
  }
  const ry = y + 18;
  body.push('<rect x="' + x0 + '" y="' + ry + '" width="' + (x1 - x0) + '" height="8" rx="0" fill="' + c.track + '"/>');
  if(hlo < 0) body.push('<rect x="' + x0 + '" y="' + ry + '" width="' + r2(rx(0) - x0) + '" height="8" rx="0" fill="' + c.err + '" fill-opacity="0.14"/>');
  body.push('<rect x="' + r2(rx(pf.p10)) + '" y="' + ry + '" width="' + r2(Math.max(1, rx(pf.p90) - rx(pf.p10))) + '" height="8" rx="0" fill="' + c.accent + '" fill-opacity="0.5"/>');
  if(hlo < 0) body.push('<line x1="' + r2(rx(0)) + '" y1="' + (ry - 3) + '" x2="' + r2(rx(0)) + '" y2="' + (ry + 11) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
  body.push('<line x1="' + r2(rx(pf.p50)) + '" y1="' + (ry - 4) + '" x2="' + r2(rx(pf.p50)) + '" y2="' + (ry + 12) + '" stroke="' + c.ink + '" stroke-width="2"/>');
  body.push(txt(rx(pf.p10), ry + 26, 'P10 ' + sgn(pf.p10), 9.5, c.muted, {anchor: 'middle', mono: true}));
  body.push(txt(rx(pf.p50), ry + 26, 'P50 ' + sgn(pf.p50), 9.5, c.ink, {anchor: 'middle', mono: true, weight: 700}));
  body.push(txt(rx(pf.p90), ry + 26, 'P90 ' + sgn(pf.p90), 9.5, c.muted, {anchor: 'middle', mono: true}));
  if(hlo < 0) body.push(txt(rx(0), ry + 26, '0', 9.5, c.muted, {anchor: 'middle', mono: true}));
  let bottom = ry + 34;
  if(stress){
    const sy = bottom + 6, spl = lossPct(stress);
    body.push(txt(x0, sy + 6, 'SHARED-OUTCOME STRESS', 8, spl >= 50 ? c.err : c.accentInk,
      {weight: 700, tracking: '0.05em'}));
    body.push(txt(x1, sy + 6, spl + '% BELOW ZERO · MEDIAN ' + sgn(stress.p50), 8,
      spl >= 50 ? c.err : c.muted, {weight: 700, anchor: 'end'}));
    const s0 = rx(stress.p10), s1 = rx(stress.p90);
    body.push('<rect x="' + r2(Math.min(s0, s1)) + '" y="' + (sy + 12) + '" width="' +
      r2(Math.max(1, Math.abs(s1 - s0))) + '" height="6" fill="' + c.err +
      '" fill-opacity="0.28" stroke="' + c.err + '" stroke-width="1" stroke-dasharray="3 2"/>');
    body.push('<line x1="' + r2(rx(stress.p50)) + '" y1="' + (sy + 9) + '" x2="' + r2(rx(stress.p50)) +
      '" y2="' + (sy + 21) + '" stroke="' + c.err + '" stroke-width="1.5"/>');
    bottom = sy + 26;
  }
  /* ghost portfolio band: the snapshot's own P10-P90, faint/dashed, drawn
     beneath the live band on the same scale — re-simulated once and
     memoised in app.js (never here; see the file header). */
  if(prevPf){
    const gy = bottom + 6;
    body.push(txt(x0, gy + 6, 'SNAPSHOT P10–P90', 8, c.muted, {weight: 600, tracking: '0.05em'}));
    const g0 = rx(prevPf.p10), g1 = rx(prevPf.p90);
    body.push('<rect x="' + r2(Math.min(g0, g1)) + '" y="' + (gy + 11) + '" width="' +
      r2(Math.max(1, Math.abs(g1 - g0))) + '" height="6" rx="0" fill="' + c.muted +
      '" fill-opacity="0.16" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
    body.push('<line x1="' + r2(rx(prevPf.p50)) + '" y1="' + (gy + 8) + '" x2="' + r2(rx(prevPf.p50)) +
      '" y2="' + (gy + 20) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="1 2"/>');
    bottom = gy + 11 + 6 + 8;
  }
  return bottom;
}

/* ---------------- NARROW: continuous position register ---------------- */
function renderNarrow(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const compare = ctx.compare || null, edit = !!ctx.edit, coarse = !!ctx.coarse;
  const W = Math.max(300, Math.round(ctx.width)), pad = 16, inner = W - pad * 2;
  /* a full-width dashed ＋ capsule (edit only) — timeline/roadmap's narrow add
     idiom: the whole 44px band is the hit rect (coarse-pointer floor), the
     visible dashed capsule sits inset within it. */
  const addCapsule = (label, aria, kind, line, top) => editTarget(
    '<rect x="' + pad + '" y="' + r2(top + 4) + '" width="' + inner + '" height="36" rx="0" fill="none" stroke="' +
      c.border + '" stroke-dasharray="3 4"/>' +
    txt(pad + inner / 2, top + 26, label, 12.5, c.muted, {anchor: 'middle', weight: 600}),
    {x: pad, y: r2(top), w: inner, h: 44, bg: c.bg},
    {kind, line, raw: '', label: aria});
  const {flat, flagged, totalStake, elo, ehi, pf, conc} = prep(model, sim);
  const conditions = conditionReadings(sim);
  const plan = boardPlan(model, sim, {measure, nameWidth: inner - 24, killWidth: inner - 24});
  const pl = lossPct(pf);
  const concLine = concentrationLine(conc);
  const ex = (v, x0, w) => x0 + (v - elo) / (ehi - elo || 1) * w;
  const parts = [];
  let y = 30;
  const titleLines = measuredLines(model.title || 'Bets board', '600 21px ' + SANS, inner, measure);
  titleLines.forEach((line, i) => parts.push('<text data-bets-title-line="" x="' + pad + '" y="' + (y + i * 24) +
    '" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="21" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>'));
  y += titleLines.length * 24 - 2;
  parts.push(txt(pad, y, flat.length + ' bets · ' + flagged + ' flagged · stake ' + num(totalStake), 11, c.muted)); y += 12;
  const receipt = conditionCards(conditions, pad, y, inner, c, true);
  parts.push(...receipt.parts); y += receipt.height + 12;
  if(compare){
    // wrapped — the label can carry a title, easily wider than a phone card
    for(const ln of measuredLines(compare.headline, '11px ' + SANS, inner, measure)){
      parts.push(txt(pad, y, ln, 11, c.accentInk, {weight: 700})); y += 15;
    }
    y += 5;
  }
  if(concLine){
    for(const ln of measuredLines(concLine, '10.5px ' + SANS, inner, measure)){
      parts.push(txt(pad, y, ln, 10.5, c.status.risk, {weight: 600})); y += 14;
    }
    y += 6;
  }
  if(plan.mode === 'ledger'){
    parts.push(txt(pad, y + 10, 'FULL BET REGISTER · SOURCE ORDER', 9.5, c.muted, {weight: 700, tracking: '0.08em'}));
    parts.push('<line x1="' + pad + '" y1="' + (y + 18) + '" x2="' + (W - pad) + '" y2="' + (y + 18) + '" stroke="' + c.border + '"/>');
    y += 30;
  }

  const killedMap = killedByGroup(compare), usedKilledKeys = new Set();
  /* a ghost register row for a killed bet — retained but un-editable. */
  function pushGhostCard(b){
    const top = y;
    y += 8;
    const card = [];
    card.push(txt(pad + 12, y + 10, b.name, 14, c.muted, {weight: 600, strike: true})); y += 22;
    card.push(txt(pad + 12, y, 'STAKE ' + rng(b.stake) + ' · ODDS ' + pct(b.odds) + ' · PAYOFF ' + rng(b.payoff), 11, c.muted, {mono: true}));
    y += 18;
    const cardH = y - top + 8;
    parts.push('<line x1="' + pad + '" y1="' + top + '" x2="' + (W - pad) + '" y2="' + top + '" stroke="' + c.border + '" stroke-dasharray="4 3"/>');
    parts.push(...card);
    parts.push(pill(pad + inner - 8, top + 16, 'KILLED', c.muted, 'end'));
    y = top + cardH + 10;
  }

  for(const g of model.groups){
    parts.push('<rect x="' + pad + '" y="' + y + '" width="4" height="16" rx="0" fill="' + c.accent + '"/>');
    parts.push(txt(pad + 12, y + 13, g.name.toUpperCase(), 11, c.accentInk, {weight: 700, tracking: '0.1em'}));
    y += 24;
    for(const b of g.bets){
      const rec = recOf(sim, b), e = rec.ev, top = y;
      const bk = compare && betKey(b);
      const isNew = !!(compare && compare.newKeys.has(bk));
      const mvRaw = compare && compare.movedFields.get(bk);
      const mv = mvRaw && Object.keys(mvRaw).length ? mvRaw : null;
      /* buffered content keeps the menu hit plane under precise field targets. */
      const card = [];
      y += 8;
      /* the rename target (edit only): the menu's Rename… row routes here, and a
         fine tap on the name opens it directly. Painted before the value cells,
         so their own hit boxes win the small overlap band below the name. */
      const nameLines = measuredLines(b.name, '600 14px ' + SANS, inner - 24, measure);
      const nameTxt = nameLines.map((line, i) => txt(pad + 12, y + 10 + i * 17, line, 14, c.ink, {weight: 600})).join('');
      if(edit && !coarse) card.push(editTarget(nameTxt,
        {x: pad + 8, y: r2(y - 6), w: inner - 16, h: Math.max(26, nameLines.length * 17 + 8), bg: c.bg},
        {kind: 'name', line: b.srcLine, raw: b.name, label: 'Rename: ' + b.name}));
      else card.push(nameTxt);
      if(isNew){
        const nameW = measure(b.name, '600 14px ' + SANS);
        card.push(pill(Math.min(pad + 12 + nameW + 8, pad + inner - 40), y + 3, 'NEW', c.accentInk));
      }
      y += 22 + (nameLines.length - 1) * 17;
      // stake / odds / payoff, editable
      ncell(card, pad + 12, y, 'STAKE', rng(b.stake), c, {kind: 'stake', line: b.srcLine, raw: rng(b.stake)}, mv && mv.stake ? c.accentInk : null, edit && !coarse);
      ncell(card, pad + 12 + inner / 3, y, 'ODDS', pct(b.odds), c, {kind: 'odds', line: b.srcLine, raw: pct(b.odds)}, mv && mv.odds ? c.accentInk : null, edit && !coarse);
      ncell(card, pad + 12 + inner * 2 / 3, y, 'PAYOFF', rng(b.payoff), c, {kind: 'payoff', line: b.srcLine, raw: rng(b.payoff)}, mv && mv.payoff ? c.accentInk : null, edit && !coarse);
      y += 34;
      if(mv){
        const was = [mv.stake && ('stake was ' + rng(mv.stake)), mv.odds && ('odds was ' + pct(mv.odds)),
          mv.payoff && ('payoff was ' + rng(mv.payoff))].filter(Boolean).join(' · ');
        card.push(txt(pad + 12, y, was, 9.5, c.muted)); y += 14;
      }
      // shared-scale exposure rule + P10/P50/P90
      const bx = pad + 12, bw = inner - 24, neg = e.p50 < 0;
      if(rec.scoreable === false){
        card.push(txt(bx, y + 8, 'NOT SCORED', 12, c.err, {mono: true, weight: 700}));
        card.push(txt(bx, y + 24, 'Correct invalid or missing terms', 10, c.muted));
        y += 36;
      } else {
      card.push('<line x1="' + bx + '" y1="' + (y + 4) + '" x2="' + (bx + bw) + '" y2="' + (y + 4) + '" stroke="' + c.border + '"/>');
      if(elo < 0) card.push('<line x1="' + r2(ex(0, bx, bw)) + '" y1="' + (y - 3) + '" x2="' + r2(ex(0, bx, bw)) + '" y2="' + (y + 11) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      card.push('<line data-exposure-range="" x1="' + r2(ex(e.p10, bx, bw)) + '" y1="' + (y + 4) + '" x2="' + r2(ex(e.p90, bx, bw)) + '" y2="' + (y + 4) + '" stroke="' + (neg ? c.err : c.accent) + '" stroke-width="4" stroke-opacity="0.7"/>');
      card.push('<line data-exposure-median="" x1="' + r2(ex(e.p50, bx, bw)) + '" y1="' + (y - 3) + '" x2="' + r2(ex(e.p50, bx, bw)) + '" y2="' + (y + 11) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
      y += 20;
      card.push(txt(pad + 12, y, 'EV ' + sgn(e.p50) + ' [' + sgn(e.p10) + ' – ' + sgn(e.p90) + ']', 11, neg ? c.err : c.muted, {mono: true, weight: neg ? 700 : 400}));
      y += 16;
      }
      if(b.kill){
        const killLines = measuredLines('↳ fold if ' + b.kill.text + (b.kill.by ? ' — by ' + b.kill.by : ''), '10.5px ' + SANS, inner - 24, measure);
        const kinner = killLines.map((line, i) => txt(pad + 12, y + 8 + i * 14, line, 10.5, c.muted)).join('');
        if(edit && !coarse) card.push(editTarget(kinner, {x: pad + 12, y: r2(y - 4), w: r2(inner - 24), h: killLines.length * 14 + 8, bg: c.bg},
          {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
        else card.push(kinner);
        y += killLines.length * 14 + 2;
      }
      if(rec.scoreable !== false && rec.audits.length){ y += 12; stampRow(card, rec.audits, W - pad - 8, y, c); y += rec.audits.length * 14; }
      y += 6;
      const cardH = y - top;
      parts.push('<g data-row="bet">');
      parts.push('<line x1="' + pad + '" y1="' + top + '" x2="' + (W - pad) + '" y2="' + top + '" stroke="' + c.border + '" stroke-width="1"/>');
      parts.push(...card);
      const menuX = coarse ? pad : pad + inner - 44, menuW = coarse ? inner : 44, menuH = coarse ? Math.max(44, cardH) : 44;
      if(edit) parts.push('<g data-edit="cardmenu" data-line="' + b.srcLine + '" data-menu=""' + menuFacts(b) + btnAttrs('More options: ' + b.name) + '>' +
        '<rect data-hit="" x="' + menuX + '" y="' + top + '" width="' + menuW + '" height="' + menuH + '" fill="transparent"/>' +
        txt(pad + inner - 18, top + 27, '⋯', 15, c.muted, {weight: 700, anchor: 'middle'}) + '</g>');
      parts.push('</g>');
      y += 10;
    }
    const gk = g.name.trim().toLowerCase();
    if(killedMap.has(gk)){
      usedKilledKeys.add(gk);
      for(const kb of killedMap.get(gk).bets) pushGhostCard(kb);
    }
    /* the group's ＋ Add bet capsule closes its block (timeline's lane idiom);
       data-line carries the GROUP's srcLine so the app can target the insert */
    if(edit){ parts.push(addCapsule('＋ Add bet', 'Add bet to ' + g.name, 'addbet', g.srcLine, y)); y += 52; }
    y += 4;
  }
  for(const [gk, glane] of killedMap){
    if(usedKilledKeys.has(gk)) continue;
    parts.push('<rect x="' + pad + '" y="' + y + '" width="4" height="16" rx="0" fill="' + c.muted + '"/>');
    parts.push(txt(pad + 12, y + 13, (glane.name || 'REMOVED').toUpperCase() + ' · GONE', 11, c.muted, {weight: 700, tracking: '0.1em'}));
    y += 24;
    for(const kb of glane.bets) pushGhostCard(kb);
    y += 4;
  }
  if(edit){ parts.push(addCapsule('＋ Add group', 'Add group', 'addgroup', -1, y)); y += 56; }
  // portfolio outcome rail
  parts.push(txt(pad, y + 10, 'PORTFOLIO — ' + flat.length + ' BETS', 10, c.ink, {weight: 700, tracking: '0.05em'})); y += 22;
  y = outcomeRail(parts, conditions, pad, W - pad, y, c, true, compare);
  parts.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  const stress = conditions.stress.result;
  return svgShell(W, y + 20, c, parts.join(''), true,
    model.title || 'Bets board',
    conditions.baseline.label + ': ' + (pf ? pl + '% lose money, median outcome ' + sgn(pf.p50) : 'not available') + '. ' +
      conditions.stress.label + ': ' + (stress ? lossPct(stress) + '% lose money, median outcome ' + sgn(stress.p50) : 'not available') + '.');
}

function ncell(parts, x, y, label, val, c, hooks, tone, direct = true){
  const inner = txt(x, y, label, 8.5, c.muted, {weight: 700, tracking: '0.06em'}) + txt(x, y + 16, val, 13, tone || c.ink, {mono: true});
  if(direct) parts.push(editTarget(inner, {x: r2(x - 2), y: r2(y - 12), w: 96, h: 34, bg: c.bg}, hooks));
  else parts.push(inner);
}

function svgShell(W, H, c, inner, narrow, title = 'Bets board', desc = 'A portfolio of explicit bets with uncertainty ranges and audit exceptions.'){
  H = Math.ceil(H);
  return '<svg data-bets-surface="allocation-field" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="' + SANS + '" role="img" aria-labelledby="bets-title bets-desc"><title id="bets-title">' + esc(title) +
    '</title><desc id="bets-desc">' + esc(desc) + '</desc><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
