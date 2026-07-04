/* /why DSL → model. No DOM. Spec §1. */
import {PALETTE_NAMES} from '../assets/series.js';

const SOLUTION_STATUSES = ['candidate', 'testing', 'delivering', 'shipped', 'parked'];
const ASSUMPTION_STATUSES = ['untested', 'testing', 'holds', 'broken'];

export function parse(text){
  const model = {title: '', palette: 'ocean', accent: null, outcomes: [], warnings: []};
  const lines = text.split(/\r?\n/);
  const stack = [];   // {node, level}

  for(let ln = 0; ln < lines.length; ln++){
    const raw = lines[ln].replace(/\t/g, '  ');
    const line = raw.trim();
    if(!line || line.startsWith('//')) continue;
    const warn = msg => model.warnings.push('line ' + (ln+1) + ': ' + msg);

    const config = line.match(/^(title|palette|accent)\s*:\s*(.*)$/i);
    if(config && stack.length === 0 && model.outcomes.length === 0){
      const key = config[1].toLowerCase(), val = config[2].trim();
      if(key === 'title') model.title = val;
      else if(key === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else warn('unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      }
      else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else warn('accent wants a 6-digit hex like #C05621');
      }
      continue;
    }

    const spaces = raw.match(/^ */)[0].length;
    if(spaces % 2 !== 0) warn('odd indent (' + spaces + ' spaces) — expected multiples of 2');
    const level = Math.round(spaces / 2);

    /* status tag anywhere in the line */
    let tag = null, body = line;
    body = body.replace(/\[([^\]]+)\]/, (m, t) => { tag = t.trim().toLowerCase(); return ''; }).trim();

    const isAssumption = body.startsWith('?');
    if(isAssumption) body = body.slice(1).trim();
    const outcomeM = body.match(/^outcome\s*:\s*(.*)$/i);

    let kind, status = null, label = body;
    if(isAssumption){
      kind = 'assumption';
      status = tag && ASSUMPTION_STATUSES.includes(tag) ? tag : 'untested';
      if(tag && !ASSUMPTION_STATUSES.includes(tag)) warn('unknown assumption status [' + tag + '] — using untested');
    } else if(outcomeM){
      kind = 'outcome';
      label = outcomeM[1].trim();
    } else if(tag && SOLUTION_STATUSES.includes(tag)){
      kind = 'solution';
      status = tag;
    } else {
      if(tag) warn('unknown status [' + tag + '] — line treated as an opportunity (use ' + SOLUTION_STATUSES.join('/') + ')');
      kind = 'opportunity';
    }
    if(!label){ warn('missing label'); label = '(unnamed)'; }

    const node = {label, kind, status, children: [], srcLine: ln};
    while(stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : null;

    if(!parent){
      if(kind !== 'outcome'){
        warn('"' + label.slice(0, 30) + '" is top-level — treated as an outcome (prefix with outcome: to silence this)');
        node.kind = 'outcome';
        node.status = null;
      }
      model.outcomes.push(node);
    } else {
      if(kind === 'assumption' && parent.kind !== 'solution'){
        warn('assumption "' + label.slice(0, 30) + '" is not under a solution');
      }
      if(kind === 'solution' && parent.kind === 'solution'){
        warn('solution "' + label.slice(0, 30) + '" is nested under another solution');
      }
      if(kind === 'outcome'){
        warn('outcome "' + label.slice(0, 30) + '" is nested — treated as an opportunity');
        node.kind = 'opportunity';
      }
      parent.children.push(node);
    }
    stack.push({node, level});
  }
  return model;
}
