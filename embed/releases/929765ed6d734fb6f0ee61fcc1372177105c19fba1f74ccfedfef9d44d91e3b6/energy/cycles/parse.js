/* /cycles DSL → model. No DOM. Soft line-numbered warnings, never hard errors;
   srcLines per key. Units normalised here and only here: % → fraction,
   augment £/kWh → £/MWh, spreads stay £/MWh. */
import {PALETTE_NAMES} from '../../assets/series.js';

const NUM = '-?\\d+(?:\\.\\d+)?';
const RANGE = new RegExp('^(' + NUM + ')(?:\\s*\\.\\.\\s*(' + NUM + '))?');
export const REQUIRED = ['battery', 'spread', 'rte', 'fade', 'calendar', 'cycles'];
const KEYS = ['title', 'verdict', 'accent', 'palette', 'battery', 'spread', 'charge', 'second',
  'drift', 'rte', 'fade', 'calendar', 'cycles', 'augment', 'discount'];

/* refused: inputs the engine cannot solve (0 MWh, a horizon under 1 year ...). A refused model is
   not simulatable; app.js keeps the last good picture and shows the warning (audit CYC-4). */
const numPct = v => String(Number((+v).toPrecision(4)));
export const complete = m => m.missing.length === 0 && (m.refused || []).length === 0;

export function parse(text){
  const m = {title: '', verdict: null, accent: null, palette: 'ember', battery: null, spread: null,
    charge: null, chargeDefaulted: false, second: null, drift: null, rte: null,
    fade: null, calendar: null, cycles: null, augment: null,
    discount: {lo: 0.08, hi: 0.08}, srcLines: {}, missing: [], refused: [], warnings: []};
  const lines = String(text).split(/\r?\n/);

  const range = (body, warn, what) => {
    const r = body.match(RANGE);
    if(!r){ warn(what + ' wants a number or range like 35..85'); return null; }
    let lo = parseFloat(r[1]), hi = r[2] === undefined ? parseFloat(r[1]) : parseFloat(r[2]);
    if(lo > hi){ warn(what + ' range is inverted — swapping'); const t = lo; lo = hi; hi = t; }
    return {lo, hi, tail: body.slice(r[0].length).trim()};
  };

  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    line = line.replace(/(^|\s)\/\/.*$/, '').trim();   // boundary-only: never split a URL's //
    if(!line) continue;
    const warn = msg => m.warnings.push('line ' + (ln + 1) + ': ' + msg);
    const refuse = msg => { warn(msg + ' — nothing can be simulated until this is fixed (the picture stays as it was)'); m.refused.push(msg); };

    const head = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if(!head){ warn('don’t know what this is — lines are key: value (' + KEYS.slice(4).join('/') + ')'); continue; }
    const key = head[1].toLowerCase(), body = head[2].trim();
    if(!KEYS.includes(key)){ warn('don’t know "' + key + '" — lines are ' + KEYS.slice(4).join('/')); continue; }
    m.srcLines[key] = ln;

    if(key === 'title'){ m.title = body; continue; }
    if(key === 'verdict'){ m.verdict = body; continue; }   // raw; assets/verdict.js owns what off/empty mean
    if(key === 'accent'){
      if(/^#[0-9a-fA-F]{6}$/.test(body)) m.accent = body;
      else warn('accent wants a 6-digit hex');
      continue;
    }
    if(key === 'palette'){
      /* validated like every other palette parser — cycles was the one that
         silently accepted any name (the artefact just fell back to accent) */
      if(PALETTE_NAMES.includes(body.toLowerCase())) m.palette = body.toLowerCase();
      else warn('unknown palette "' + body + '" — options: ' + PALETTE_NAMES.join(', '));
      continue;
    }
    if(key === 'battery'){
      const b = body.match(new RegExp('^(' + NUM + ')\\s*MW\\s*/\\s*(' + NUM + ')\\s*MWh$', 'i'));
      if(!b){ warn('battery wants "100MW / 200MWh"'); continue; }
      m.battery = {mw: parseFloat(b[1]), mwh: parseFloat(b[2])};
      if(!(m.battery.mwh > 0) || !(m.battery.mw > 0)) refuse('battery needs MW and MWh above 0');
      continue;
    }
    if(key === 'cycles'){
      const c = body.match(new RegExp('^(' + NUM + ')\\s+over\\s+(' + NUM + ')\\s*yr$', 'i'));
      if(!c){ warn('cycles wants "6000 over 15yr"'); continue; }
      m.cycles = {budget: parseFloat(c[1]), years: Math.round(parseFloat(c[2]))};
      if(m.cycles.years < 1) refuse('cycles needs a horizon of at least 1 year (' + c[2] + 'yr rounds to ' + m.cycles.years + ')');
      else if(String(m.cycles.years) !== String(parseFloat(c[2]))) warn('horizon ' + c[2] + 'yr rounded to ' + m.cycles.years);
      if(m.cycles.years > 30) warn('a ' + m.cycles.years + '-year horizon — beliefs this far out are decoration; 30 is the honest cap');
      continue;
    }
    const r = range(body, warn, key);
    if(!r) continue;
    const PCT = ['second', 'drift', 'rte', 'fade', 'calendar', 'discount'];
    const FRACTION_OK = ['rte', 'second', 'discount'];   // plausible percents are > 1 there; fade/calendar legitimately sit below 1
    let scale = 1;
    if(PCT.includes(key)){
      const hasPct = /^%(\s*\/\s*(yr|year|cycle))?$/i.test(r.tail);
      if(r.tail && !hasPct) warn(key + ': unrecognised unit "' + r.tail + '" — percent fields take a number, optionally with %');
      if(!r.tail && FRACTION_OK.includes(key) && r.lo > 0 && r.hi <= 1){
        warn(key + ' ' + body + ' read as a fraction (' + numPct(r.lo * 100) + (r.hi !== r.lo ? '..' + numPct(r.hi * 100) : '') + '%) — write the percent to be explicit');
        r.lo *= 100; r.hi *= 100;
      }
    } else if(key === 'spread' || key === 'charge' || key === 'augment'){
      const u = r.tail === '' ? null : (r.tail.match(/^(?:£|gbp)?\s*\/\s*(kwh|mwh)$/i) || [])[1];
      const unit = u ? u.toLowerCase() : null;
      if(r.tail !== '' && !unit) warn(key + ': unrecognised unit "' + r.tail + '" — use £/MWh or £/kWh');
      const perKwh = key === 'augment' ? unit !== 'mwh' : unit === 'kwh';   // augment defaults to £/kWh; spread/charge to £/MWh
      scale = perKwh ? 1000 : 1;
      r.lo *= scale; r.hi *= scale;
    }
    const pct = x => ({lo: x.lo / 100, hi: x.hi / 100});
    if(key === 'spread') m.spread = r;
    else if(key === 'charge'){ m.charge = r; if(r.lo < 0) warn('charge below 0 — treated as 0'); }
    else if(key === 'second'){ m.second = pct(r); if(r.lo < 0 || r.hi > 100) warn('second is clamped to 0–100% of the day’s best'); }
    else if(key === 'drift') m.drift = pct(r);
    else if(key === 'rte'){
      m.rte = pct(r);
      if(r.lo < 50) warn('rte below 50% — the model floors it at 50%');
      if(r.hi >= 99.9) warn('rte of ' + numPct(r.hi) + '% — the model caps it at 99.9%');
    }
    else if(key === 'fade'){
      m.fade = pct(r);
      if(m.fade.hi === 0) warn('fade: 0 — free cycling claimed; the threshold will be warranty-only');
      if(r.lo < 0) warn('fade below 0 — treated as 0');
    }
    else if(key === 'calendar'){ m.calendar = pct(r); if(r.lo < 0) warn('calendar below 0 — treated as 0'); }
    else if(key === 'augment'){ m.augment = {lo: r.lo, hi: r.hi}; if(r.lo < 0) warn('augment below 0 — treated as 0'); }
    else if(key === 'discount'){ m.discount = pct(r); if(r.lo < 0.1) warn('discount below 0.1% — the model floors it at 0.1%'); }
    delete r.tail;
  }

  m.missing = REQUIRED.filter(k => !m[k]);
  if(!m.missing.length){
    const p50 = Math.sqrt(m.spread.lo * m.spread.hi) || m.spread.lo;
    if(!m.charge){
      const c = 0.45 * p50;
      m.charge = {lo: c, hi: c};
      m.chargeDefaulted = true;
      m.warnings.push('no charge: line — assuming charge cost ≈ 45% of spread for the efficiency penalty');
    } else if(m.rte && (m.rte.lo + m.rte.hi) / 2 > 0){
      // charge only bites as the round-trip efficiency penalty k = (1/rte − 1)·charge
      // (~11% of charge at rte 0.9); comparing charge itself to the spread warned ~9× too eagerly.
      const rteMid = (m.rte.lo + m.rte.hi) / 2;
      const k = (1 / rteMid - 1) * (m.charge.lo + m.charge.hi) / 2;
      if(k >= p50)
        m.warnings.push('the round-trip efficiency penalty exceeds the spread — check rte: / charge:');
    }
    if(!m.drift)
      m.warnings.push('no drift: line — flat spreads flatter the augmentation case; is that intended?');
  }
  return m;
}
