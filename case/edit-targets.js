/* Pure text rewrites for /case edit-in-place. No DOM; the text is the model. */

const CONFIG_LINE = /^(title|question|status|verdict|palette|accent)\s*:/i;

export const validators = {
  /* a label sits between [Lane:] and -> — no newline, no ->, no // and not a
     config key (would re-parse as config) */
  label(v){
    const s = v.trim();
    return s.length > 0 && !s.includes('\n') && !s.includes('->') &&
      !s.includes('//') && !CONFIG_LINE.test(s);
  },
  note(v){ return !v.includes('\n') && !v.includes('->'); },
  question(v){ return !v.includes('\n'); },
};

export function editLabel(line, oldRaw, newRaw){
  const i = line.indexOf(oldRaw);
  if(i < 0) return line;
  return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
}

/* the note is everything after the whitespace-boundary // — replace or append;
   an empty value strips it */
export function editNote(line, oldRaw, newRaw){
  const v = newRaw.trim();
  const m = line.match(/\s\/\/\s?.*$/);
  const head = m ? line.slice(0, m.index).replace(/\s*$/, '') : line.replace(/\s*$/, '');
  return v ? head + ' // ' + v : head;
}

/* question is a config line — rewrite it whole; absent key gets inserted
   after title (or prepended) so the standfirst is editable from an empty doc */
export function setQuestion(text, value){
  const v = String(value).trim();
  const lines = String(text).split('\n');
  const at = lines.findIndex(l => /^question\s*:/i.test(l.trim()));
  if(at >= 0){
    if(v) lines[at] = 'question: ' + v;
    else lines.splice(at, 1);
    return lines.join('\n');
  }
  if(!v) return text;
  const titleAt = lines.findIndex(l => /^title\s*:/i.test(l.trim()));
  lines.splice(titleAt >= 0 ? titleAt + 1 : 0, 0, 'question: ' + v);
  return lines.join('\n');
}
