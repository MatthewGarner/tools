/* Pure text rewrites for /map edit-in-place and drag. No DOM.
   Text stays the source of truth: a drop or an edit is exactly one text change. */

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

/* drag drop: rewrite or insert `@ x,y` in the pre-:: part of the line */
export function setPosition(line, x, y){
  const cut = line.indexOf('::');
  const head = (cut < 0 ? line : line.slice(0, cut))
    .replace(/@\s*-?[\d.]+\s*,\s*-?[\d.]+/, '').replace(/\s+$/, '');
  const rest = cut < 0 ? '' : ' ' + line.slice(cut);
  return head + ' @ ' + x + ',' + y + rest;
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
