/* /risk DSL → model. No DOM. Soft line-numbered warnings, never hard errors;
   srcLine on every node. Values are one representative year in `unit`. */
import {PALETTE_NAMES} from '../../assets/series.js';

const NUM = '-?\\d+(?:\\.\\d+)?';
const PARAM_KEYS = {floor: ['share', 'fee'], toll: ['fee'], insure: ['premium', 'attach', 'limit']};

export function defaultLabel(kind, p){
  if(kind === 'floor') return 'Floor ' + p.level + (p.share < 1 ? ' / ' + Math.round(p.share * 100) + '%' : '');
  if(kind === 'toll') return 'Toll ' + p.fixed;
  return 'Insure @' + p.attach;
}

export function parse(text){
  const model = {title: '', palette: 'ember', accent: null, unit: '£k/MW/yr',
    merchant: null, structures: [], warnings: []};
  const lines = String(text).split(/\r?\n/);

  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    const warn = msg => model.warnings.push('line ' + (ln + 1) + ': ' + msg);
    const cm = line.indexOf('//');
    if(cm >= 0) line = line.slice(0, cm).trim();
    if(!line) continue;

    const config = line.match(/^(title|palette|accent|unit)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase(), val = config[2].trim();
      if(key === 'title') model.title = val;
      else if(key === 'unit') model.unit = val || model.unit;
      else if(key === 'palette'){
        if(PALETTE_NAMES.includes(val.toLowerCase())) model.palette = val.toLowerCase();
        else warn('unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      } else if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
      else warn('accent wants a 6-digit hex like #C05621');
      continue;
    }

    const head = line.match(/^(merchant|floor|toll|insure)\s*:\s*(.*)$/i);
    if(!head){
      warn('don’t know what this is — lines start merchant: / floor: / toll: / insure: (or //)');
      continue;
    }
    const kind = head[1].toLowerCase();
    let body = head[2].trim(), label = null;
    const lm = body.match(/"([^"]*)"\s*$/);
    if(lm){ label = lm[1].trim() || null; body = body.slice(0, lm.index).trim(); }

    if(kind === 'merchant'){
      const r = body.match(new RegExp('^(' + NUM + ')\\s*\\.\\.\\s*(' + NUM + ')$'));
      if(!r){ warn('merchant wants a 90% range like 60..180'); continue; }
      let lo = parseFloat(r[1]), hi = parseFloat(r[2]);
      if(lo > hi){ warn('merchant range is inverted — swapping'); const t = lo; lo = hi; hi = t; }
      if(lo === hi) warn('a zero-width range claims a certainty nobody has');
      if(model.merchant){ warn('second merchant line ignored — one revenue distribution per model'); continue; }
      model.merchant = {lo, hi, srcLine: ln};
      continue;
    }

    const params = {};
    const lead = body.match(new RegExp('^(' + NUM + ')\\s*'));
    if(lead){
      params[kind === 'floor' ? 'level' : 'fixed'] = parseFloat(lead[1]);
      body = body.slice(lead[0].length);
    }
    for(const m of body.matchAll(new RegExp('(share|fee|premium|attach|limit)\\s+(' + NUM + ')\\s*(%?)', 'gi'))){
      const k = m[1].toLowerCase();
      if(!PARAM_KEYS[kind].includes(k)){ warn(k + ' doesn’t apply to ' + kind); continue; }
      params[k] = parseFloat(m[2]);
    }

    if(kind === 'floor'){
      if(!('level' in params)){ warn('floor wants a level, like "floor: 70"'); continue; }
      if('share' in params){
        if(params.share > 100){ warn('share above 100% — clamping'); params.share = 100; }
        if(params.share < 0){ warn('negative share — clamping to 0'); params.share = 0; }
        params.share = params.share / 100;
      } else params.share = 1;
      params.fee = Math.max(0, params.fee || 0);
      delete params.fixed;
    } else if(kind === 'toll'){
      if(!('fixed' in params)){ warn('toll wants a fixed payment, like "toll: 95"'); continue; }
      params.fee = Math.max(0, params.fee || 0);
    } else {
      if(!('premium' in params) || !('attach' in params)){
        warn('insure wants at least "premium P attach A"'); continue;
      }
      if(!('limit' in params)) params.limit = Infinity;
      delete params.fixed;
    }
    model.structures.push({kind, label: label || defaultLabel(kind, params), params, srcLine: ln});
  }

  /* merchant-dependent honesty warnings */
  if(model.merchant){
    const {lo, hi} = model.merchant;
    const mid = (lo + hi) / 2;
    const at = ln => 'line ' + (ln + 1) + ': ';
    for(const s of model.structures){
      if(s.kind === 'floor' && s.params.level >= hi)
        model.warnings.push(at(s.srcLine) + 'floor at ' + s.params.level + ' is above your P95 — it always binds; this is really a toll');
      if(s.kind === 'floor' && s.params.level <= lo)
        model.warnings.push(at(s.srcLine) + 'floor at ' + s.params.level + ' is below your P5 — it never binds; is that intended?');
      if(s.kind === 'insure' && s.params.attach >= mid)
        model.warnings.push(at(s.srcLine) + 'attach at ' + s.params.attach + ' insures the median year — cover usually sits in the tail');
    }
  } else if(model.structures.length){
    model.warnings.push('no merchant: line — add one (like "merchant: 60..180") to have something to compare against');
  }
  return model;
}
