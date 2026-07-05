/* /map DSL → model. No DOM. */
import {PALETTE_NAMES} from '../assets/series.js';
import {PRESET_NAMES} from './zones.js';

export const MAX_ITEMS = 40;

function parseAxis(val, srcLine){
  const m = val.match(/^(.*?)\(([^()]*)\)\s*$/);
  if(m){
    const ends = m[2].split(/→|->/);
    if(ends.length === 2)
      return {label: m[1].trim(), low: ends[0].trim(), high: ends[1].trim(), srcLine};
  }
  return {label: val.trim(), low: null, high: null, srcLine};
}

export function parseRules(src){
  const rules = [];
  for(const part of src.split('&')){
    const m = part.trim().match(/^(x\s*\+\s*y|x\s*-\s*y|x|y)\s*([<>])\s*(-?\d+(?:\.\d+)?)$/i);
    if(!m) return {error: 'can’t read "' + part.trim() + '" — use x/y/x+y/x-y with < or > a number'};
    rules.push({expr: m[1].replace(/\s+/g, '').toLowerCase(), op: m[2], val: +m[3]});
  }
  return {rules};
}

export function parse(text){
  const model = {title: '', palette: 'ocean', accent: null, preset: null,
    axes: {x: null, y: null}, grid: null, cellNames: [], ruleZones: [],
    items: [], warnings: []};
  const lines = text.split(/\r?\n/);

  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    const warn = msg => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

    const zoneM = line.match(/^zone\s+([^:]+?)\s*:\s*(.*)$/i);
    if(zoneM){
      const head = zoneM[1].trim(), body = zoneM[2].replace(/\s\/\/.*$/, '').trim();
      const cellM = head.match(/^(\d+)\s*,\s*(\d+)$/);
      if(cellM){
        if(!body){ warn('zone ' + head + ' wants a name'); continue; }
        model.cellNames.push({col: +cellM[1], row: +cellM[2], name: body, srcLine: ln});
      } else {
        const r = parseRules(body);
        if(r.error){ warn('zone ' + head + ': ' + r.error); continue; }
        model.ruleZones.push({name: head, rules: r.rules, srcLine: ln});
      }
      continue;
    }

    const config = line.match(/^(preset|title|palette|accent|x|y|zones)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase(), val = config[2].replace(/\s\/\/.*$/, '').trim();
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
      else if(key === 'preset'){
        const p = val.toLowerCase();
        if(PRESET_NAMES.includes(p)) model.preset = p;
        else warn('unknown preset "' + val + '" — options: ' + PRESET_NAMES.join(', '));
      }
      else if(key === 'x' || key === 'y') model.axes[key] = parseAxis(val, ln);
      else if(key === 'zones'){
        const g = val.match(/^grid\s+(\d+)\s*x\s*(\d+)$/i);
        if(!g){ warn('zones wants "grid NxM", e.g. zones: grid 3x3'); continue; }
        const cols = +g[1], rows = +g[2];
        if(cols < 1 || rows < 1 || cols > 6 || rows > 6)
          warn('grid ' + cols + 'x' + rows + ' out of range — 1x1 to 6x6');
        else model.grid = {cols, rows, srcLine: ln};
      }
      continue;
    }

    /* item line: Label [@ x,y] [:: field: value]* [// trailing comment] */
    const segs = line.replace(/\s\/\/.*$/, '').split('::');
    let head = segs[0].trim();
    let x = null, y = null;
    const posM = head.match(/@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(posM){
      x = +posM[1]; y = +posM[2];
      head = head.slice(0, posM.index).trim();
      if(x < 0 || x > 100 || y < 0 || y > 100){
        warn('position ' + x + ',' + y + ' clamped to 0–100');
        x = Math.min(100, Math.max(0, x));
        y = Math.min(100, Math.max(0, y));
      }
    }
    const fields = [];
    for(const seg of segs.slice(1)){
      const fm = seg.trim().match(/^([\w-]+)\s*:\s*(.*)$/);
      if(fm) fields.push({key: fm[1].toLowerCase(), val: fm[2].trim(), srcLine: ln});
      else {
        warn('field "' + seg.trim().slice(0, 24) + '" wants key: value — kept as a note');
        fields.push({key: 'note', val: seg.trim(), srcLine: ln});
      }
    }
    if(!head){ warn('missing label'); head = '(unnamed)'; }
    model.items.push({label: head, x, y, fields, srcLine: ln});
  }

  if(model.items.length > MAX_ITEMS)
    model.warnings.push(model.items.length + ' items — beyond ~' + MAX_ITEMS +
      ' the map gets crowded; consider splitting');
  return model;
}
