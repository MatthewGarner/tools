/* Pure text rewrites for /map edit-in-place and drag. No DOM.
   Text stays the source of truth: a drop or an edit is exactly one text change. */
import {parse} from './parse.js';

const CONFIG_LINE = /^(preset|title|palette|accent|x|y|zones)\s*:|^zone\s+[^:]+:/i;

export const validators = {
  label(v){
    const s = v.trim();
    return s.length > 0 && !s.includes('::') && !s.includes('@') && !s.includes('\n') &&
      !s.startsWith('//') && !CONFIG_LINE.test(s);
  },
  zonename(v){
    const s = v.trim();
    return s.length > 0 && !/[:&\n]/.test(s);
  },
  axis(v){
    const s = v.trim();
    return s.length > 0 && !/[():\n]/.test(s);
  },
  field(v){
    return v.trim().length > 0 && !v.includes('::') && !v.includes('\n');
  },
};

/* drag drop + tap-to-place: rewrite or insert `@ x,y`. Mirrors the parser
   exactly: the trailing // comment is split off FIRST (an @ or :: inside it is
   never touched), the position is the ANCHORED trailing @ x,y of the pre-::
   head (a mid-label @ the parser reads as text stays text), and coords are
   clamped to 0–100 integers so a tap just outside the plane can't write a
   warning-triggering value. Comment-only and config lines pass through. */
export function setPosition(line, x, y){
  const t = line.trim();
  if(t.startsWith('//') || CONFIG_LINE.test(t)) return line;
  const cm = line.match(/\s\/\/.*$/);
  const comment = cm ? cm[0] : '';
  const body = cm ? line.slice(0, cm.index) : line;
  const cut = body.indexOf('::');
  const head = (cut < 0 ? body : body.slice(0, cut))
    .replace(/@\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/, '').replace(/\s+$/, '');
  const rest = cut < 0 ? '' : ' ' + body.slice(cut);
  const cl = v => Math.max(0, Math.min(100, Math.round(v)));
  return head + ' @ ' + cl(x) + ',' + cl(y) + rest + comment;
}

export function editLabel(line, oldRaw, newRaw){
  const i = line.indexOf(oldRaw);
  if(i < 0) return line;
  return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
}

export function editField(line, key, oldVal, newVal){
  const segs = line.split('::');
  for(let i = 1; i < segs.length; i++){
    const m = segs[i].match(/^(\s*)([\w-]+)(\s*:\s*)(.*?)(\s*)$/);
    if(m && m[2].toLowerCase() === key.toLowerCase() && m[4] === oldVal){
      segs[i] = m[1] + m[2] + m[3] + newVal.trim() + m[5];
      return segs.join('::');
    }
  }
  return line;
}

/* index just past the leading config block (comments/blanks inside it are skipped) */
export function configInsertIndex(lines){
  let last = -1;
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim();
    if(!t || t.startsWith('//')) continue;
    if(CONFIG_LINE.test(t)) last = i;
    else break;
  }
  return last + 1;
}

export function renameZone(text, ref, newName){
  const lines = text.split(/\r?\n/);
  const name = newName.trim();
  if(ref.srcLine != null){
    const line = lines[ref.srcLine];
    if(ref.kind === 'cell'){
      const m = line.match(/^(\s*zone\s+\d+\s*,\s*\d+\s*:\s*)(.*)$/i);
      if(!m) return null;
      lines[ref.srcLine] = m[1] + name;
    } else {
      const m = line.match(/^(\s*zone\s+)([^:]+?)(\s*:)/i);
      if(!m) return null;
      lines[ref.srcLine] = m[1] + name + line.slice(m[1].length + m[2].length);
    }
  } else if(ref.kind === 'cell'){
    lines.splice(configInsertIndex(lines), 0, 'zone ' + ref.col + ',' + ref.row + ': ' + name);
  } else {
    return null;   // preset rule zones aren't renamable in v1
  }
  return lines.join('\n');
}

export function setAxisLabel(text, axis, newLabel){
  const lines = text.split(/\r?\n/);
  const re = new RegExp('^(\\s*' + axis + '\\s*:\\s*)(.*)$', 'i');
  for(let i = 0; i < lines.length; i++){
    if(lines[i].trim().startsWith('//')) continue;
    const m = lines[i].match(re);
    if(m){
      const ends = m[2].match(/\([^()]*\)\s*$/);
      lines[i] = m[1] + newLabel.trim() + (ends ? ' ' + ends[0].trim() : '');
      return lines.join('\n');
    }
  }
  lines.splice(configInsertIndex(lines), 0, axis + ': ' + newLabel.trim());
  return lines.join('\n');
}

/* ---- add/remove items (S1) ---- */

/* New items go after the last item (else after the config block) and carry
   no @ position — they land in the unplaced tray, ready to drag. */
export function addItemLine(text){
  const model = parse(text);
  if(model.items.length){
    return {afterLine: model.items[model.items.length - 1].srcLine};
  }
  const lines = text.split(/\r?\n/);
  const at = configInsertIndex(lines);
  return {afterLine: Math.max(0, Math.min(at, lines.length) - 1)};
}

/* Only lines that parse as items may be removed. */
export function removeItemLine(text, srcLine){
  return parse(text).items.some(i => i.srcLine === srcLine);
}
