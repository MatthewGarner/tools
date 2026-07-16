/* /cycles DSL → model. No DOM. Soft line-numbered warnings, never hard errors;
   srcLines per key. Units normalised here and only here: % → fraction,
   augment £/kWh → £/MWh, spreads stay £/MWh. */
const NUM = '-?\\d+(?:\\.\\d+)?';
const RANGE = new RegExp('^(' + NUM + ')(?:\\s*\\.\\.\\s*(' + NUM + '))?');
export const REQUIRED = ['battery', 'spread', 'rte', 'fade', 'calendar', 'cycles'];
const KEYS = ['title', 'accent', 'palette', 'battery', 'spread', 'charge', 'second',
  'drift', 'rte', 'fade', 'calendar', 'cycles', 'augment', 'discount'];

export const complete = m => m.missing.length === 0;

export function parse(text){
  const m = {title: '', accent: null, palette: 'ember', battery: null, spread: null,
    charge: null, chargeDefaulted: false, second: null, drift: null, rte: null,
    fade: null, calendar: null, cycles: null, augment: null,
    discount: {lo: 0.08, hi: 0.08}, srcLines: {}, missing: [], warnings: []};
  const lines = String(text).split(/\r?\n/);

  const range = (body, warn, what) => {
    const r = body.match(RANGE);
    if(!r){ warn(what + ' wants a number or range like 35..85'); return null; }
    let lo = parseFloat(r[1]), hi = r[2] === undefined ? parseFloat(r[1]) : parseFloat(r[2]);
    if(lo > hi){ warn(what + ' range is inverted — swapping'); const t = lo; lo = hi; hi = t; }
    return {lo, hi};
  };

  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    const cm = line.indexOf('//');
    if(cm >= 0) line = line.slice(0, cm).trim();
    if(!line) continue;
    const warn = msg => m.warnings.push('line ' + (ln + 1) + ': ' + msg);

    const head = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if(!head){ warn('don’t know what this is — lines are key: value (' + KEYS.slice(3).join('/') + ')'); continue; }
    const key = head[1].toLowerCase(), body = head[2].trim();
    if(!KEYS.includes(key)){ warn('don’t know "' + key + '" — lines are ' + KEYS.slice(3).join('/')); continue; }
    m.srcLines[key] = ln;

    if(key === 'title'){ m.title = body; continue; }
    if(key === 'accent'){
      if(/^#[0-9a-fA-F]{6}$/.test(body)) m.accent = body;
      else warn('accent wants a 6-digit hex');
      continue;
    }
    if(key === 'palette'){ m.palette = body.toLowerCase(); continue; }
    if(key === 'battery'){
      const b = body.match(new RegExp('^(' + NUM + ')\\s*MW\\s*/\\s*(' + NUM + ')\\s*MWh$', 'i'));
      if(!b){ warn('battery wants "100MW / 200MWh"'); continue; }
      m.battery = {mw: parseFloat(b[1]), mwh: parseFloat(b[2])};
      continue;
    }
    if(key === 'cycles'){
      const c = body.match(new RegExp('^(' + NUM + ')\\s+over\\s+(' + NUM + ')\\s*yr$', 'i'));
      if(!c){ warn('cycles wants "6000 over 15yr"'); continue; }
      m.cycles = {budget: parseFloat(c[1]), years: Math.round(parseFloat(c[2]))};
      if(m.cycles.years > 30) warn('a ' + m.cycles.years + '-year horizon — beliefs this far out are decoration; 30 is the honest cap');
      continue;
    }
    const r = range(body, warn, key);
    if(!r) continue;
    const pct = x => ({lo: x.lo / 100, hi: x.hi / 100});
    if(key === 'spread') m.spread = r;
    else if(key === 'charge') m.charge = r;
    else if(key === 'second') m.second = pct(r);
    else if(key === 'drift') m.drift = pct(r);
    else if(key === 'rte') m.rte = pct(r);
    else if(key === 'fade'){
      m.fade = pct(r);
      if(m.fade.hi === 0) warn('fade: 0 — free cycling claimed; the threshold will be warranty-only');
    }
    else if(key === 'calendar') m.calendar = pct(r);
    else if(key === 'augment') m.augment = {lo: r.lo * 1000, hi: r.hi * 1000};
    else if(key === 'discount') m.discount = pct(r);
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
