/* model + sim → bet-slip board SVG string. Design: a trading-BLOTTER skeleton
   (position ledger — every claim in a column you can run a finger down) wearing
   rubber-STAMPED audits (a failed audit reads like a compliance stamp, not a
   coded box). Wide = the ledger; narrow (<520) = stacked position cards. Pure;
   colours + measure from ctx. Edit hooks on stake/odds/payoff/kill + a per-row
   data-menu for the coarse-pointer card menu. Every user string via txt()/esc.
   Snapshot compare (2026-07-12) rides in via ctx.compare — see diff.js for the
   shape (newKeys/movedFields/killed/headline from betsDiffView) plus a
   `prevSim` app.js resimulates and memoises (never here — a Monte Carlo run
   per keystroke isn't free). Absent ctx.compare, output stays byte-identical
   to the pre-compare goldens: every addition below is gated on `compare`.
   ctx.edit (mobile-input stage, 2026-07-16) gates the STRUCTURE surface the
   same way: a rename target on every bet name (both layouts — the shared card
   menu's Rename… row routes to it), plus narrow-only ＋ Add bet / ＋ Add group
   capsules. Absent ctx.edit, output stays byte-identical to the goldens; the
   value targets + per-card data-menu predate the flag and stay unconditional. */
import {esc, txt, tint, editTarget, wrapText, btnAttrs} from '../assets/svg.js';
import {betKey} from './diff.js';
import {boardPlan, measuredLines} from './layout.js';

const WIDE = 1240;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const r2 = n => Math.round(n * 100) / 100;
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const recOf = (sim, b) => sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
/* portfolio-level concentration honesty note — null when no bet reaches the
   engine's ≥40%-of-total-stake threshold, so callers reserve no gap for it */
const concentrationLine = conc => !conc ? null :
  '⚑ ' + conc.name + ' is ' + Math.round(conc.share * 100) + '% of total stake — one bet carries the book.';

export function renderBoard(model, sim, ctx = {}){
  return (!!ctx.width && ctx.width < 520) ? renderNarrow(model, sim, ctx) : renderWide(model, sim, ctx);
}

/* shared inputs both layouts need */
function prep(model, sim){
  const flat = [];
  for(const g of model.groups) for(const b of g.bets) flat.push(b);
  const flagged = flat.filter(b => recOf(sim, b).audits.length).length;
  const totalStake = flat.reduce((t, b) => t + stakeMid(b), 0);
  let elo = 0, ehi = 1;
  for(const b of flat){ const e = recOf(sim, b).ev; elo = Math.min(elo, e.p10); ehi = Math.max(ehi, e.p90); }
  const epad = (ehi - elo) * 0.05 || 1;
  return {flat, flagged, totalStake, elo: elo - epad, ehi: ehi + epad, pf: sim.portfolio, conc: sim.concentration};
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

/* a failed-audit rubber stamp (rotated, red ruled border, letterspaced ink) */
function stamp(label, cx, cy, c, rot){
  const w = label.length * 6.0 + 20;
  return '<g transform="rotate(' + rot + ' ' + r2(cx) + ' ' + r2(cy) + ')">' +
    '<rect x="' + r2(cx - w / 2) + '" y="' + r2(cy - 9) + '" width="' + r2(w) + '" height="18" rx="0" fill="' + c.err +
    '" fill-opacity="0.07" stroke="' + c.err + '" stroke-width="1.5"/>' +
    txt(cx, cy + 3.5, label, 9, c.err, {weight: 700, anchor: 'middle', tracking: '0.06em'}) + '</g>';
}
/* lay audit stamps right-aligned from xRight; returns the leftmost x used */
function stampRow(parts, audits, xRight, cy, c){
  let x = xRight;
  audits.forEach((a, i) => {
    const w = a.length * 6.0 + 20;
    const cx = x - w / 2;
    parts.push(stamp(a, cx, cy, c, i % 2 ? -2.5 : -4));
    x -= w + 10;
  });
  return x;
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
  const plan = boardPlan(model, sim, {measure});
  const pl = Math.round((pf.pLoss || 0) * 100);
  const concLine = concentrationLine(conc);
  /* Name, numeric strip, EV range and audit marks each own a non-overlapping
     horizontal region. Long names wrap inside nameEnd; failed audits stack in
     the dedicated right gutter instead of competing with EV marks. */
  const C = {left: 40, id: 44, name: 84, nameEnd: 322,
    strip0: 334, stake: 410, odds: 500, payoff: 596, strip1: 620,
    p10: 704, p50: 774, p90: 844, bar0: 866, bar1: 1000,
    audit0: 1022, audit1: 1200, right: 1200};
  const ex = v => C.bar0 + (v - elo) / (ehi - elo || 1) * (C.bar1 - C.bar0);
  const parts = [], body = [];

  /* header strap */
  parts.push('<text x="40" y="52" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="24" fill="' + c.ink + '">' + esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(40, 74, flat.length + ' POSITIONS · ' + model.groups.length + ' BOOKS · TOTAL STAKE ' + num(totalStake) + ' · ' + flagged + ' FLAGGED', 10, c.muted, {mono: true, tracking: '0.05em'}));
  parts.push(txt(C.right, 50, 'P(LOSES MONEY) ' + pl + '%', 17, pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true, anchor: 'end'}));
  parts.push(txt(C.right, 72, 'NET EV ' + sgn(pf.p50) + ' · P10 ' + sgn(pf.p10) + ' · P90 ' + sgn(pf.p90), 10, c.muted, {mono: true, anchor: 'end'}));
  if(compare) parts.push(txt(40, 96, compare.headline, 11.5, c.accentInk, {weight: 700, tracking: '0.01em'}));

  // column heads
  const panelTop = compare ? 112 : 90, colHeadY = panelTop + 26;
  for(const [s, x, a] of [['POSITION', C.left, 'start'], ['STAKE', C.stake, 'end'], ['ODDS', C.odds, 'end'],
    ['PAYOFF', C.payoff, 'end'], ['EV P10', C.p10, 'end'], ['P50', C.p50, 'end'], ['P90', C.p90, 'end']])
    body.push(txt(x, colHeadY, s, 9, c.muted, {weight: 700, tracking: '0.08em', anchor: a}));
  body.push(txt((C.bar0 + C.bar1) / 2, colHeadY, 'P10 ▸ P90', 9, c.muted, {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  body.push(txt((C.audit0 + C.audit1) / 2, colHeadY, 'AUDIT', 9, c.muted,
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
      body.push('<g data-row="bet" data-id="' + row.id + '" data-edit="cardmenu" data-line="' + b.srcLine + '" data-menu=""' + btnAttrs('More options: ' + b.name) + '>');
      body.push('<rect data-hit="" x="' + C.left + '" y="' + y + '" width="' + (C.right - C.left) + '" height="' + rowH + '" fill="transparent"/>');
      if(rec.audits.length) body.push('<rect x="' + C.left + '" y="' + y + '" width="' + (C.right - C.left) + '" height="' + rowH + '" fill="' + c.err + '" fill-opacity="0.035"/>');
      body.push('<rect data-numeric-strip="" x="' + C.strip0 + '" y="' + y + '" width="' + (C.strip1 - C.strip0) + '" height="' + rowH +
        '" fill="' + c.track + '" fill-opacity="0.42"/>');
      body.push('<rect data-audit-gutter="" x="' + C.audit0 + '" y="' + y + '" width="' + (C.audit1 - C.audit0) + '" height="' + rowH +
        '" fill="' + c.card + '" fill-opacity="0.55"/>');
      body.push(txt(C.id, y + row.nameTop, row.id, 9, plan.mode === 'ledger' ? c.accentInk : c.muted, {weight: 700, mono: true}));
      const nameY = y + row.nameTop;
      const nameTxt = row.nameLines.map((line, i) => txt(C.name, nameY + i * 16, line, 13, c.ink, {weight: 600})).join('');
      if(edit) body.push(editTarget(nameTxt,
        {x: C.name - 6, y: y + (plan.mode === 'ledger' ? 17 : 5), w: C.nameEnd - C.name + 8,
          h: Math.max(28, row.nameLines.length * 16 + 8), bg: c.bg},
        {kind: 'name', line: b.srcLine, raw: b.name, label: 'Rename: ' + b.name}));
      else body.push(nameTxt);
      if(isNew){
        body.push(pill(C.nameEnd - 42, y + 14, 'NEW', c.accentInk));
      }
      cell(body, C.stake, y + 4, rng(b.stake), e, c, {kind: 'stake', line: b.srcLine, raw: rng(b.stake)}, mv && mv.stake ? c.accentInk : null);
      cell(body, C.odds, y + 4, pct(b.odds), e, c, {kind: 'odds', line: b.srcLine, raw: pct(b.odds)}, mv && mv.odds ? c.accentInk : null);
      cell(body, C.payoff, y + 4, rng(b.payoff), e, c, {kind: 'payoff', line: b.srcLine, raw: rng(b.payoff)}, mv && mv.payoff ? c.accentInk : null);
      body.push(txt(C.p10, y + 23, sgn(e.p10), 12, e.p10 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      body.push(txt(C.p50, y + 23, sgn(e.p50), 12, e.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
      body.push(txt(C.p90, y + 23, sgn(e.p90), 12, e.p90 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      // inline range bar, shared scale
      const neg = e.p50 < 0;
      body.push('<rect x="' + C.bar0 + '" y="' + (y + 15) + '" width="' + (C.bar1 - C.bar0) + '" height="7" rx="0" fill="' + c.track + '"/>');
      body.push('<rect x="' + r2(ex(e.p10)) + '" y="' + (y + 15) + '" width="' + r2(Math.max(1.5, ex(e.p90) - ex(e.p10))) + '" height="7" rx="0" fill="' + (neg ? c.err : c.accent) + '" fill-opacity="0.6"/>');
      body.push('<line x1="' + r2(ex(0)) + '" y1="' + (y + 12) + '" x2="' + r2(ex(0)) + '" y2="' + (y + 25) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      body.push('<line x1="' + r2(ex(e.p50)) + '" y1="' + (y + 13) + '" x2="' + r2(ex(e.p50)) + '" y2="' + (y + 24) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
      // sub-line: kill "fold if" on the left (editable), moved "was …" + stamps on the right
      if(b.kill){
        const killY = nameY + row.nameLines.length * 16 + 5;
        const inner = row.killLines.map((line, i) => txt(C.name, killY + i * 14, line, 10.5, c.muted)).join('');
        body.push(editTarget(inner, {x: C.name - 4, y: r2(killY - 12), w: C.nameEnd - C.name + 6,
          h: row.killLines.length * 14 + 7, bg: c.bg},
          {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
      }
      if(mv){
        const wy = y + 43;
        if(mv.stake) body.push(txt(C.stake, wy, 'was ' + rng(mv.stake), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.odds) body.push(txt(C.odds, wy, 'was ' + pct(mv.odds), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.payoff) body.push(txt(C.payoff, wy, 'was ' + rng(mv.payoff), 9, c.muted, {mono: true, anchor: 'end'}));
      }
      rec.audits.forEach((audit, i) => body.push(stamp(audit, (C.audit0 + C.audit1) / 2, y + 17 + i * 21, c, i % 2 ? -2 : -4)));
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
  body.push(txt(C.p10, y + 24, sgn(pf.p10), 13, pf.p10 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.p50, y + 24, sgn(pf.p50), 13, pf.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.p90, y + 24, sgn(pf.p90), 13, pf.p90 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.right, y + 24, flagged + ' FLAGGED', 9.5, flagged ? c.err : c.muted, {weight: 700, anchor: 'end', tracking: '0.05em'}));
  y += 40;

  // concentration honesty note — one line, only when the engine flags a bet
  if(concLine){
    body.push(txt(C.left, y + 12, concLine, 11.5, c.status.risk, {weight: 600}));
    y += 22;
  }

  // outcome rail
  y = outcomeRail(body, pf, pl, C.left, C.right, y, c, false, compare);
  const panelBot = y + 8;
  parts.push('<rect x="16" y="' + panelTop + '" width="' + (WIDE - 32) + '" height="' + (panelBot - panelTop) + '" rx="0" fill="' + c.card + '" stroke="' + c.border + '" stroke-width="1"/>');
  parts.push(...body);
  parts.push(txt(C.left, panelBot + 22, 'RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS · STAMPS MARK FAILED AUDITS · BETS ASSUMED INDEPENDENT', 9, c.muted, {tracking: '0.04em'}));
  parts.push(txt(C.right, panelBot + 22, 'ALL FIGURES ' + (model.unit || '').toUpperCase(), 9, c.muted, {anchor: 'end', tracking: '0.05em'}));

  const H = panelBot + 40;
  return svgShell(WIDE, H, c, parts.join(''), false);
}

/* a right-aligned editable numeric cell (stake/odds/payoff); `tone` overrides
   the value's fill (compare mode: accent when this field moved since the
   snapshot) — omit/null for the default ink. */
function cell(body, x, y, str, e, c, hooks, tone){
  const inner = txt(x, y + 19, str, 12, tone || c.ink, {mono: true, anchor: 'end'});
  body.push(editTarget(inner, {x: r2(x - 64), y: r2(y + 2), w: 68, h: 26, bg: c.bg}, hooks));
}

function outcomeRail(body, pf, pl, x0, x1, y, c, narrow, compare){
  const bins = pf.histogram || [[0, 1, 0]];
  const prevPf = compare && compare.prevSim && compare.prevSim.portfolio;
  const prevBins = prevPf && prevPf.histogram;
  /* one shared scale for both bands — the ghost must sit on the same ruler
     as the live one, or "drift" reads as noise instead of movement. */
  const hlo = Math.min(bins[0][0], 0, prevBins ? prevBins[0][0] : Infinity);
  const hhi = Math.max(bins[bins.length - 1][1], 1, prevBins ? prevBins[prevBins.length - 1][1] : -Infinity);
  const rx = v => x0 + (v - hlo) / (hhi - hlo || 1) * (x1 - x0);
  if(narrow){                                              // stack — the two captions collide on a phone
    body.push(txt(x0, y + 6, 'SIMULATED OUTCOMES — 4,000 RUNS', 9, c.muted, {weight: 700, tracking: '0.06em'}));
    body.push(txt(x0, y + 20, pl + '% OF RUNS END BELOW ZERO', 9.5, pl >= 50 ? c.err : c.accentInk, {weight: 700, tracking: '0.04em'}));
    y += 18;
  } else {
    body.push(txt(x0, y + 10, 'SIMULATED OUTCOMES — 4,000 SEEDED RUNS', 9, c.muted, {weight: 700, tracking: '0.08em'}));
    body.push(txt(x1, y + 10, pl + '% OF RUNS END BELOW ZERO', 9, pl >= 50 ? c.err : c.accentInk, {weight: 700, tracking: '0.05em', anchor: 'end'}));
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

/* ---------------- NARROW: stacked position cards ---------------- */
function renderNarrow(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const compare = ctx.compare || null, edit = !!ctx.edit;
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
  const plan = boardPlan(model, sim, {measure, nameWidth: inner - 24, killWidth: inner - 24});
  const pl = Math.round((pf.pLoss || 0) * 100);
  const concLine = concentrationLine(conc);
  const ex = (v, x0, w) => x0 + (v - elo) / (ehi - elo || 1) * w;
  const parts = [];
  let y = 30;
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="21" fill="' + c.ink + '">' + esc(model.title || 'Bets board') + '</text>');
  y += 22;
  parts.push(txt(pad, y, 'P(LOSES MONEY) ' + pl + '%', 15, pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true})); y += 18;
  parts.push(txt(pad, y, 'NET EV ' + sgn(pf.p50) + ' [' + sgn(pf.p10) + ' – ' + sgn(pf.p90) + '] ' + (model.unit || ''), 11.5, c.muted, {mono: true})); y += 16;
  parts.push(txt(pad, y, flat.length + ' bets · ' + flagged + ' flagged · stake ' + num(totalStake), 11, c.muted)); y += 20;
  if(compare){
    // wrapped — the label can carry a title, easily wider than a phone card
    for(const ln of wrapText(compare.headline, '11px ' + SANS, inner, measure)){
      parts.push(txt(pad, y, ln, 11, c.accentInk, {weight: 700})); y += 15;
    }
    y += 5;
  }
  if(concLine){
    for(const ln of wrapText(concLine, '10.5px ' + SANS, inner, measure)){
      parts.push(txt(pad, y, ln, 10.5, c.status.risk, {weight: 600})); y += 14;
    }
    y += 6;
  }
  if(plan.mode === 'ledger'){
    parts.push('<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="52" fill="' + c.accent + '" fill-opacity="0.07"/>');
    parts.push(txt(pad + 12, y + 21, 'PORTFOLIO LEDGER', 11, c.accentInk, {weight: 700, tracking: '0.1em'}));
    parts.push(txt(pad + 12, y + 41, 'FULL BET REGISTER · SOURCE ORDER', 9.5, c.muted, {weight: 700, tracking: '0.06em'}));
    y += 64;
  }

  const killedMap = killedByGroup(compare), usedKilledKeys = new Set();
  /* a ghost card for a killed bet — same rhythm as a live card (muted/dashed/
     struck, un-editable: its srcLine is the SNAPSHOT's, not this editor's). */
  function pushGhostCard(b){
    const top = y;
    y += 8;
    const card = [];
    card.push(txt(pad + 12, y + 10, b.name, 14, c.muted, {weight: 600, strike: true})); y += 22;
    card.push(txt(pad + 12, y, 'STAKE ' + rng(b.stake) + ' · ODDS ' + pct(b.odds) + ' · PAYOFF ' + rng(b.payoff), 11, c.muted, {mono: true}));
    y += 18;
    const cardH = y - top + 8;
    parts.push('<rect x="' + pad + '" y="' + top + '" width="' + inner + '" height="' + r2(cardH) +
      '" rx="0" fill="' + c.muted + '" fill-opacity="0.03" stroke="' + c.border + '" stroke-width="1" stroke-dasharray="4 3"/>');
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
      /* card content is buffered separately so the hit + background rects
         (which need the FINAL cardH, only known once the card's content is
         laid out) can still be unshifted to the FRONT of the card's markup —
         same "hit rect paints first, fields on top" ordering as the wide
         layout, so a tap on the stake/odds/payoff cells or the kill line
         still lands on THEIR OWN data-edit target, not this card-level one. */
      const card = [];
      y += 8;
      /* the rename target (edit only): the menu's Rename… row routes here, and a
         fine tap on the name opens it directly. Painted before the value cells,
         so their own hit boxes win the small overlap band below the name. */
      const nameLines = measuredLines(b.name, '600 14px ' + SANS, inner - 24, measure);
      const nameTxt = nameLines.map((line, i) => txt(pad + 12, y + 10 + i * 17, line, 14, c.ink, {weight: 600})).join('');
      if(edit) card.push(editTarget(nameTxt,
        {x: pad + 8, y: r2(y - 6), w: inner - 16, h: Math.max(26, nameLines.length * 17 + 8), bg: c.bg},
        {kind: 'name', line: b.srcLine, raw: b.name, label: 'Rename: ' + b.name}));
      else card.push(nameTxt);
      if(isNew){
        const nameW = measure(b.name, '600 14px ' + SANS);
        card.push(pill(Math.min(pad + 12 + nameW + 8, pad + inner - 40), y + 3, 'NEW', c.accentInk));
      }
      y += 22 + (nameLines.length - 1) * 17;
      // stake / odds / payoff, editable
      ncell(card, pad + 12, y, 'STAKE', rng(b.stake), c, {kind: 'stake', line: b.srcLine, raw: rng(b.stake)}, mv && mv.stake ? c.accentInk : null);
      ncell(card, pad + 12 + inner / 3, y, 'ODDS', pct(b.odds), c, {kind: 'odds', line: b.srcLine, raw: pct(b.odds)}, mv && mv.odds ? c.accentInk : null);
      ncell(card, pad + 12 + inner * 2 / 3, y, 'PAYOFF', rng(b.payoff), c, {kind: 'payoff', line: b.srcLine, raw: rng(b.payoff)}, mv && mv.payoff ? c.accentInk : null);
      y += 34;
      if(mv){
        const was = [mv.stake && ('stake was ' + rng(mv.stake)), mv.odds && ('odds was ' + pct(mv.odds)),
          mv.payoff && ('payoff was ' + rng(mv.payoff))].filter(Boolean).join(' · ');
        card.push(txt(pad + 12, y, was, 9.5, c.muted)); y += 14;
      }
      // EV bar + P10/P50/P90
      const bx = pad + 12, bw = inner - 24, neg = e.p50 < 0;
      card.push('<rect x="' + bx + '" y="' + y + '" width="' + bw + '" height="8" rx="0" fill="' + c.track + '"/>');
      if(elo < 0) card.push('<line x1="' + r2(ex(0, bx, bw)) + '" y1="' + (y - 3) + '" x2="' + r2(ex(0, bx, bw)) + '" y2="' + (y + 11) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      card.push('<rect x="' + r2(ex(e.p10, bx, bw)) + '" y="' + y + '" width="' + r2(Math.max(1.5, ex(e.p90, bx, bw) - ex(e.p10, bx, bw))) + '" height="8" rx="0" fill="' + (neg ? c.err : c.accent) + '" fill-opacity="0.55"/>');
      card.push('<line x1="' + r2(ex(e.p50, bx, bw)) + '" y1="' + (y - 3) + '" x2="' + r2(ex(e.p50, bx, bw)) + '" y2="' + (y + 11) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
      y += 20;
      card.push(txt(pad + 12, y, 'EV ' + sgn(e.p50) + ' [' + sgn(e.p10) + ' – ' + sgn(e.p90) + ']', 11, neg ? c.err : c.muted, {mono: true, weight: neg ? 700 : 400}));
      y += 16;
      if(b.kill){
        const line = wrapText('↳ fold if ' + b.kill.text + (b.kill.by ? ' — by ' + b.kill.by : ''), '10.5px ' + SANS, inner - 24, measure)[0];
        const kinner = txt(pad + 12, y + 8, line, 10.5, c.muted);
        card.push(editTarget(kinner, {x: pad + 12, y: r2(y - 4), w: r2(inner - 24), h: 22, bg: c.bg},
          {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
        y += 16;
      }
      if(rec.audits.length){ y += 12; stampRow(card, rec.audits, W - pad - 8, y, c); y += 8; }
      y += 6;
      const cardH = y - top;
      parts.push('<g data-edit="cardmenu" data-line="' + b.srcLine + '" data-menu=""' + btnAttrs('More options: ' + b.name) + '>');
      parts.push('<rect data-hit="" x="' + pad + '" y="' + top + '" width="' + inner + '" height="' + r2(cardH) + '" fill="transparent"/>');
      parts.push('<rect x="' + pad + '" y="' + top + '" width="' + inner + '" height="' + r2(cardH) + '" rx="0" fill="' + c.card + '" fill-opacity="0.5" stroke="' + (rec.audits.length ? c.err : c.border) + '" stroke-width="1.2" stroke-opacity="' + (rec.audits.length ? '0.5' : '1') + '"/>');
      parts.push(...card);
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
  y = outcomeRail(parts, pf, pl, pad, W - pad, y, c, true, compare);
  parts.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  return svgShell(W, y + 20, c, parts.join(''), true);
}

function ncell(parts, x, y, label, val, c, hooks, tone){
  const inner = txt(x, y, label, 8.5, c.muted, {weight: 700, tracking: '0.06em'}) + txt(x, y + 16, val, 13, tone || c.ink, {mono: true});
  parts.push(editTarget(inner, {x: r2(x - 2), y: r2(y - 12), w: 96, h: 34, bg: c.bg}, hooks));
}

function svgShell(W, H, c, inner, narrow){
  H = Math.ceil(H);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="' + SANS + '"><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
