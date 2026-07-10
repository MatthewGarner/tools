/* /wardley DSL → map model. No DOM. Edges mean "A needs B" (B sits below A). */
import {PALETTE_NAMES} from '../assets/series.js';

export const STAGES = [
  {name: 'genesis',   lo: 0,    hi: 0.25, mid: 0.125},
  {name: 'custom',    lo: 0.25, hi: 0.5,  mid: 0.375},
  {name: 'product',   lo: 0.5,  hi: 0.75, mid: 0.625},
  {name: 'commodity', lo: 0.75, hi: 1,    mid: 0.875},
];

export function stageOf(x){
  return STAGES.find(s => x < s.hi) || STAGES[STAGES.length - 1];
}

export function parse(text){
  const model = {title: '', palette: 'ocean', accent: null,
    anchors: [], components: new Map(), edges: [], warnings: []};
  const lines = text.split(/\r?\n/);
  const key = s => s.toLowerCase();
  let sawContent = false;

  const declare = (name, x, stage, ghost, ln, warn) => {
    const k = key(name);
    if(model.components.has(k) || model.anchors.some(a => key(a.name) === k)){
      warn('duplicate component "' + name + '" — first declaration wins');
      return;
    }
    model.components.set(k, {name, x, stage, ghost, srcLine: ln});
  };

  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].split('//')[0].trim();   // trailing comments are comments too
    if(!line) continue;
    const warn = msg => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

    const config = line.match(/^(title|palette|accent|anchor)\s*:\s*(.*)$/i);
    if(config){
      const k = config[1].toLowerCase(), val = config[2].trim();
      if(k === 'anchor'){
        if(!val){ warn('anchor wants a name'); continue; }
        model.anchors.push({name: val, srcLine: ln});
        sawContent = true;
        continue;
      }
      if(sawContent){ warn('config keys go before the map — ignored'); continue; }
      if(k === 'title') model.title = val;
      else if(k === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else warn('unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      } else if(k === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else warn('accent wants a 6-digit hex like #C05621');
      }
      continue;
    }

    sawContent = true;

    if(line.includes('->')){
      const segs = line.split('->').map(s => s.trim());
      if(segs.some(s => !s)){ warn('edge has an empty end — write "A -> B"'); }
      const names = segs.filter(Boolean);
      for(let i = 0; i + 1 < names.length; i++){
        const from = key(names[i]), to = key(names[i + 1]);
        if(from === to){ warn('"' + names[i] + '" can\'t depend on itself'); continue; }
        model.edges.push({from, to, srcLine: ln, _names: [names[i], names[i + 1]]});
      }
      continue;
    }

    const at = line.match(/^(.*?)\s*@\s*(.+)$/);
    if(at){
      const name = at[1].trim(), pos = at[2].trim();
      if(!name){ warn('missing component name before "@"'); continue; }
      const stage = STAGES.find(s => s.name === pos.toLowerCase());
      if(stage){ declare(name, stage.mid, stage.name, false, ln, warn); continue; }
      const n = Number(pos);
      if(Number.isFinite(n)){
        if(n < 0 || n > 1) warn('evolution runs 0–1 — clamped');
        declare(name, Math.min(1, Math.max(0, n)), null, false, ln, warn);
        continue;
      }
      warn('unknown stage "' + pos + '" — use genesis, custom, product, commodity or a number 0–1');
      declare(name, null, null, true, ln, warn);
      continue;
    }

    declare(line, null, null, true, ln, warn);
    model.warnings.push('line ' + (ln + 1) + ': "' + line +
      '" has no position — ghost until you add "@ custom" or drag it');
  }

  if(!model.anchors.length){
    model.warnings.push('no anchor: line — added "User need" (the map wants a user at the top)');
    model.anchors.push({name: 'User need', srcLine: -1});
  }

  /* resolve edge endpoints: anchors and components are fine; anything else
     auto-creates a ghost so the chain still draws */
  const known = k => model.components.has(k) || model.anchors.some(a => key(a.name) === k);
  for(const e of model.edges){
    for(const [i, k] of [e.from, e.to].entries()){
      if(!known(k)){
        model.warnings.push('line ' + (e.srcLine + 1) + ': undeclared "' + e._names[i] +
          '" — added as a ghost');
        model.components.set(k, {name: e._names[i], x: null, stage: null, ghost: true, srcLine: e.srcLine});
      }
    }
    delete e._names;
  }
  return model;
}
