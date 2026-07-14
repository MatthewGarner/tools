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
   to the pre-compare goldens: every addition below is gated on `compare`. */
import {esc, txt, tint, editTarget, wrapText, btnAttrs} from '../assets/svg.js';
import {betKey} from './diff.js';

const WIDE = 960;
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
    '<rect x="' + r2(cx - w / 2) + '" y="' + r2(cy - 9) + '" width="' + r2(w) + '" height="18" rx="3" fill="' + c.err +
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
  return '<rect x="' + r2(left) + '" y="' + r2(y - 10) + '" width="' + r2(w) + '" height="15" rx="3" fill="' +
    color + '" fill-opacity="0.1" stroke="' + color + '" stroke-width="1"/>' +
    txt(left + w / 2, y + 3.5, label, 8.5, color, {weight: 700, anchor: 'middle', tracking: '0.05em'});
}

/* ---------------- WIDE: the ledger ---------------- */
function renderWide(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const compare = ctx.compare || null;
  const {flat, flagged, totalStake, elo, ehi, pf, conc} = prep(model, sim);
  const pl = Math.round((pf.pLoss || 0) * 100);
  const concLine = concentrationLine(conc);
  const C = {name: 30, stake: 300, odds: 388, payoff: 494, p10: 574, p50: 646, p90: 718, bar0: 736, bar1: 892, right: 930};
  const ex = v => C.bar0 + (v - elo) / (ehi - elo || 1) * (C.bar1 - C.bar0);
  const parts = [], body = [];

  /* header strap. bare (poster-embed): the frame owns the title, the P(loses)
     headline and the net-EV line — its hero says the first two and its footer
     repeats all three — so drop them and keep only the positions strap, which is
     the one fact the frame never prints. */
  const bare = !!ctx.bare;
  /* emit order is load-bearing: the goldens are byte-compared, so the non-bare
     path must push exactly what it always did, in the order it always did */
  if(!bare)
    parts.push('<text x="30" y="52" font-family="Charter, Georgia, serif" font-size="24" fill="' + c.ink + '">' + esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(30, bare ? 20 : 74, flat.length + ' POSITIONS · ' + model.groups.length + ' BOOKS · TOTAL STAKE ' + num(totalStake) + ' · ' + flagged + ' FLAGGED', 10, c.muted, {mono: true, tracking: '0.05em'}));
  if(!bare){
    parts.push(txt(C.right, 50, 'P(LOSES MONEY) ' + pl + '%', 17, pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true, anchor: 'end'}));
    parts.push(txt(C.right, 72, 'NET EV ' + sgn(pf.p50) + ' · P10 ' + sgn(pf.p10) + ' · P90 ' + sgn(pf.p90), 10, c.muted, {mono: true, anchor: 'end'}));
  }
  if(compare) parts.push(txt(30, bare ? 42 : 96, compare.headline, 11.5, c.accentInk, {weight: 700, tracking: '0.01em'}));

  // column heads
  const panelTop = bare ? (compare ? 58 : 36) : (compare ? 112 : 90), colHeadY = panelTop + 26;
  for(const [s, x, a] of [['POSITION', C.name, 'start'], ['STAKE', C.stake, 'end'], ['ODDS', C.odds, 'end'],
    ['PAYOFF', C.payoff, 'end'], ['EV P10', C.p10, 'end'], ['P50', C.p50, 'end'], ['P90', C.p90, 'end']])
    body.push(txt(x, colHeadY, s, 9, c.muted, {weight: 700, tracking: '0.08em', anchor: a}));
  body.push(txt((C.bar0 + C.bar1) / 2, colHeadY, 'P10 ▸ P90', 9, c.muted, {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  body.push('<line x1="30" y1="' + (colHeadY + 9) + '" x2="' + C.right + '" y2="' + (colHeadY + 9) + '" stroke="' + c.ink + '" stroke-width="1.5" stroke-opacity="0.8"/>');

  const killedMap = killedByGroup(compare), usedKilledKeys = new Set();
  /* a ghost row for a killed bet: same column rhythm as a live row so it
     scans in place, but muted/dashed/struck and un-editable — its srcLine
     points into the SNAPSHOT source, not this editor, so no edit hooks. */
  function pushGhostRow(b){
    const rowH = 30;
    body.push('<rect x="30" y="' + y + '" width="' + (C.right - 30) + '" height="' + rowH +
      '" fill="' + c.muted + '" fill-opacity="0.035" stroke="' + c.border + '" stroke-width="1" stroke-dasharray="4 3"/>');
    body.push(txt(C.name, y + 19, b.name, 13, c.muted, {weight: 600, strike: true}));
    body.push(txt(C.stake, y + 19, rng(b.stake), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(txt(C.odds, y + 19, pct(b.odds), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(txt(C.payoff, y + 19, rng(b.payoff), 12, c.muted, {mono: true, anchor: 'end'}));
    body.push(pill(C.right, y + 15, 'KILLED', c.muted, 'end'));
    y += rowH;
    body.push('<line x1="30" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.border + '" stroke-width="0.75" stroke-dasharray="2 2"/>');
  }

  let y = colHeadY + 14;
  for(const g of model.groups){
    body.push(txt(30, y + 17, g.name.toUpperCase(), 10, c.accentInk, {weight: 700, tracking: '0.14em'}));
    const gStake = g.bets.reduce((t, b) => t + stakeMid(b), 0);
    body.push(txt(C.right, y + 17, g.bets.length + ' POSITIONS · STAKE ' + num(gStake), 9, c.muted, {mono: true, anchor: 'end'}));
    y += 25;
    for(const b of g.bets){
      const rec = recOf(sim, b), e = rec.ev;
      const bk = compare && betKey(b);
      const isNew = !!(compare && compare.newKeys.has(bk));
      const mvRaw = compare && compare.movedFields.get(bk);
      const mv = mvRaw && Object.keys(mvRaw).length ? mvRaw : null;
      const sub = b.kill || rec.audits.length || mv;
      const rowH = sub ? 46 : 30;
      /* the row's own hit rect paints FIRST (behind the stake/odds/payoff/kill
         sub-targets that follow) so a click on one of THOSE still lands on
         its own data-edit target — this rect only catches the gaps. Painting
         it last (topmost) would swallow every click in the row, including
         ones meant for the smaller cells (roadmap's cardmenu row is the
         proven precedent for this ordering). */
      body.push('<g data-edit="cardmenu" data-line="' + b.srcLine + '" data-menu=""' + btnAttrs('More options: ' + b.name) + '>');
      body.push('<rect data-hit="" x="30" y="' + y + '" width="' + (C.right - 30) + '" height="' + rowH + '" fill="transparent"/>');
      if(rec.audits.length) body.push('<rect x="30" y="' + y + '" width="' + (C.right - 30) + '" height="' + rowH + '" fill="' + c.err + '" fill-opacity="0.035"/>');
      body.push(txt(C.name, y + 19, b.name, 13, c.ink, {weight: 600}));
      if(isNew){
        const nameW = measure(b.name, '600 13px ' + SANS);
        const nx = Math.min(C.name + nameW + 8, C.stake - 42);
        body.push(pill(nx, y + 12, 'NEW', c.accentInk));
      }
      cell(body, C.stake, y, rng(b.stake), e, c, {kind: 'stake', line: b.srcLine, raw: rng(b.stake)}, mv && mv.stake ? c.accentInk : null);
      cell(body, C.odds, y, pct(b.odds), e, c, {kind: 'odds', line: b.srcLine, raw: pct(b.odds)}, mv && mv.odds ? c.accentInk : null);
      cell(body, C.payoff, y, rng(b.payoff), e, c, {kind: 'payoff', line: b.srcLine, raw: rng(b.payoff)}, mv && mv.payoff ? c.accentInk : null);
      body.push(txt(C.p10, y + 19, sgn(e.p10), 12, e.p10 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      body.push(txt(C.p50, y + 19, sgn(e.p50), 12, e.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
      body.push(txt(C.p90, y + 19, sgn(e.p90), 12, e.p90 < 0 ? c.err : c.muted, {mono: true, anchor: 'end'}));
      // inline range bar, shared scale
      const neg = e.p50 < 0;
      body.push('<rect x="' + C.bar0 + '" y="' + (y + 11) + '" width="' + (C.bar1 - C.bar0) + '" height="7" rx="3.5" fill="' + c.track + '"/>');
      body.push('<rect x="' + r2(ex(e.p10)) + '" y="' + (y + 11) + '" width="' + r2(Math.max(1.5, ex(e.p90) - ex(e.p10))) + '" height="7" rx="3.5" fill="' + (neg ? c.err : c.accent) + '" fill-opacity="0.6"/>');
      body.push('<line x1="' + r2(ex(0)) + '" y1="' + (y + 8) + '" x2="' + r2(ex(0)) + '" y2="' + (y + 21) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      body.push('<line x1="' + r2(ex(e.p50)) + '" y1="' + (y + 9) + '" x2="' + r2(ex(e.p50)) + '" y2="' + (y + 20) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
      // sub-line: kill "fold if" on the left (editable), moved "was …" + stamps on the right
      if(b.kill){
        const killMaxW = mv ? (C.stake - (C.name + 14) - 10) : (C.payoff - (C.name + 14));
        const line = wrapText('↳ fold if ' + b.kill.text + (b.kill.by ? ' — by ' + b.kill.by : ''), '10.5px ' + SANS, killMaxW, measure)[0];
        const inner = txt(C.name + 14, y + 37, line, 10.5, c.muted);
        body.push(editTarget(inner, {x: C.name, y: r2(y + 26), w: r2(measure(line, '10.5px ' + SANS) + 20), h: 20, bg: c.bg},
          {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
      }
      if(mv){
        const wy = y + 37;
        if(mv.stake) body.push(txt(C.stake, wy, 'was ' + rng(mv.stake), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.odds) body.push(txt(C.odds, wy, 'was ' + pct(mv.odds), 9, c.muted, {mono: true, anchor: 'end'}));
        if(mv.payoff) body.push(txt(C.payoff, wy, 'was ' + rng(mv.payoff), 9, c.muted, {mono: true, anchor: 'end'}));
      }
      if(rec.audits.length) stampRow(body, rec.audits, C.right, y + 36, c);
      body.push('</g>');
      y += rowH;
      body.push('<line x1="30" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.border + '" stroke-width="0.75"/>');
    }
    const gk = g.name.trim().toLowerCase();
    if(killedMap.has(gk)){
      usedKilledKeys.add(gk);
      for(const kb of killedMap.get(gk).bets) pushGhostRow(kb);
    }
    y += 6;
  }
  for(const [gk, glane] of killedMap){
    if(usedKilledKeys.has(gk)) continue;
    body.push(txt(30, y + 17, (glane.name || 'REMOVED').toUpperCase(), 10, c.muted, {weight: 700, tracking: '0.14em'}));
    body.push(txt(C.right, y + 17, glane.bets.length + ' KILLED', 9, c.muted, {mono: true, anchor: 'end'}));
    y += 25;
    for(const kb of glane.bets) pushGhostRow(kb);
    y += 6;
  }

  // portfolio total
  y += 2;
  body.push('<line x1="30" y1="' + y + '" x2="' + C.right + '" y2="' + y + '" stroke="' + c.ink + '" stroke-width="1.5" stroke-opacity="0.8"/>');
  body.push(txt(C.name, y + 24, 'PORTFOLIO — ' + flat.length + ' BETS', 10.5, c.ink, {weight: 700, tracking: '0.05em'}));
  body.push(txt(C.stake, y + 24, num(totalStake), 13, c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.p10, y + 24, sgn(pf.p10), 13, pf.p10 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.p50, y + 24, sgn(pf.p50), 13, pf.p50 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.p90, y + 24, sgn(pf.p90), 13, pf.p90 < 0 ? c.err : c.ink, {mono: true, anchor: 'end', weight: 700}));
  body.push(txt(C.right, y + 24, flagged + ' FLAGGED', 9.5, flagged ? c.err : c.muted, {weight: 700, anchor: 'end', tracking: '0.05em'}));
  y += 40;

  // concentration honesty note — one line, only when the engine flags a bet
  if(concLine){
    body.push(txt(C.name, y + 12, concLine, 11.5, c.status.risk, {weight: 600}));
    y += 22;
  }

  // outcome rail
  y = outcomeRail(body, pf, pl, 30, C.right, y, c, false, compare);
  const panelBot = y + 8;
  parts.push('<rect x="16" y="' + panelTop + '" width="' + (WIDE - 32) + '" height="' + (panelBot - panelTop) + '" rx="10" fill="' + c.card + '" stroke="' + c.border + '" stroke-width="1"/>');
  parts.push(...body);
  parts.push(txt(30, panelBot + 22, 'RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS · STAMPS MARK FAILED AUDITS · BETS ASSUMED INDEPENDENT', 9, c.muted, {tracking: '0.04em'}));
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
  body.push('<rect x="' + x0 + '" y="' + ry + '" width="' + (x1 - x0) + '" height="8" rx="4" fill="' + c.track + '"/>');
  if(hlo < 0) body.push('<rect x="' + x0 + '" y="' + ry + '" width="' + r2(rx(0) - x0) + '" height="8" rx="4" fill="' + c.err + '" fill-opacity="0.14"/>');
  body.push('<rect x="' + r2(rx(pf.p10)) + '" y="' + ry + '" width="' + r2(Math.max(1, rx(pf.p90) - rx(pf.p10))) + '" height="8" rx="4" fill="' + c.accent + '" fill-opacity="0.5"/>');
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
      r2(Math.max(1, Math.abs(g1 - g0))) + '" height="6" rx="3" fill="' + c.muted +
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
  const compare = ctx.compare || null;
  const W = Math.max(300, Math.round(ctx.width)), pad = 16, inner = W - pad * 2;
  const {flat, flagged, totalStake, elo, ehi, pf, conc} = prep(model, sim);
  const pl = Math.round((pf.pLoss || 0) * 100);
  const concLine = concentrationLine(conc);
  const ex = (v, x0, w) => x0 + (v - elo) / (ehi - elo || 1) * w;
  const parts = [];
  let y = 30;
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="Charter, Georgia, serif" font-size="21" fill="' + c.ink + '">' + esc(model.title || 'Bets board') + '</text>');
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
      '" rx="10" fill="' + c.muted + '" fill-opacity="0.03" stroke="' + c.border + '" stroke-width="1" stroke-dasharray="4 3"/>');
    parts.push(...card);
    parts.push(pill(pad + inner - 8, top + 16, 'KILLED', c.muted, 'end'));
    y = top + cardH + 10;
  }

  for(const g of model.groups){
    parts.push('<rect x="' + pad + '" y="' + y + '" width="4" height="16" rx="2" fill="' + c.accent + '"/>');
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
      card.push(txt(pad + 12, y + 10, b.name, 14, c.ink, {weight: 600}));
      if(isNew){
        const nameW = measure(b.name, '600 14px ' + SANS);
        card.push(pill(Math.min(pad + 12 + nameW + 8, pad + inner - 40), y + 3, 'NEW', c.accentInk));
      }
      y += 22;
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
      card.push('<rect x="' + bx + '" y="' + y + '" width="' + bw + '" height="8" rx="4" fill="' + c.track + '"/>');
      if(elo < 0) card.push('<line x1="' + r2(ex(0, bx, bw)) + '" y1="' + (y - 3) + '" x2="' + r2(ex(0, bx, bw)) + '" y2="' + (y + 11) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
      card.push('<rect x="' + r2(ex(e.p10, bx, bw)) + '" y="' + y + '" width="' + r2(Math.max(1.5, ex(e.p90, bx, bw) - ex(e.p10, bx, bw))) + '" height="8" rx="4" fill="' + (neg ? c.err : c.accent) + '" fill-opacity="0.55"/>');
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
      parts.push('<rect x="' + pad + '" y="' + top + '" width="' + inner + '" height="' + r2(cardH) + '" rx="10" fill="' + c.card + '" fill-opacity="0.5" stroke="' + (rec.audits.length ? c.err : c.border) + '" stroke-width="1.2" stroke-opacity="' + (rec.audits.length ? '0.5' : '1') + '"/>');
      parts.push(...card);
      parts.push('</g>');
      y += 10;
    }
    const gk = g.name.trim().toLowerCase();
    if(killedMap.has(gk)){
      usedKilledKeys.add(gk);
      for(const kb of killedMap.get(gk).bets) pushGhostCard(kb);
    }
    y += 4;
  }
  for(const [gk, glane] of killedMap){
    if(usedKilledKeys.has(gk)) continue;
    parts.push('<rect x="' + pad + '" y="' + y + '" width="4" height="16" rx="2" fill="' + c.muted + '"/>');
    parts.push(txt(pad + 12, y + 13, (glane.name || 'REMOVED').toUpperCase() + ' · GONE', 11, c.muted, {weight: 700, tracking: '0.1em'}));
    y += 24;
    for(const kb of glane.bets) pushGhostCard(kb);
    y += 4;
  }
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
