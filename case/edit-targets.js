/* Pure text rewrites for /case edit-in-place. No DOM; the text is the model. */

const CONFIG_LINE = /^(title|question|status|verdict|palette|accent)\s*:/i;

export const validators = {
  /* a label sits between [Lane:] and -> — no newline, no ->, no // and not a
     config key (would re-parse as config) */
  label(v){
    const s = v.trim();
    return s.length > 0 && !/[\r\n]/.test(s) && !s.includes('->') &&
      !s.includes('//') && !CONFIG_LINE.test(s);
  },
  note(v){ return !/[\r\n]/.test(v) && !v.includes('->'); },
  question(v){ return !/[\r\n]/.test(v) && !hasConfigComment(v); },
  title(v){ return !/[\r\n]/.test(v) && !hasConfigComment(v) && v.trim().length > 0; },
  verdict(v){ return !/[\r\n]/.test(v) && !hasConfigComment(v); },
};

// Config parsing treats whitespace-boundary // as a comment. Native fields
// must not accept text whose visible draft differs from its parsed value.
function hasConfigComment(v){ return /(^|\s)\/\//.test(String(v)); }

const textLines = text => ({
  lines: String(text).split(/\r?\n/),
  ending: String(text).includes('\r\n') ? '\r\n' : '\n',
});

const joinLines = ({lines, ending}) => lines.join(ending);

function setConfigValue(text, key, value, afterKeys = []){
  const source = textLines(text);
  const matching = source.lines.map((line, index) =>
    new RegExp('^' + key + '\\s*:', 'i').test(line.trim()) ? index : -1
  ).filter(index => index >= 0);
  // The parser makes the last duplicate config line authoritative, so native
  // edits must target the same one. Clearing removes every duplicate to avoid
  // revealing an older hidden value instead of the requested empty state.
  const at = matching.at(-1) ?? -1;
  const v = String(value).trim();
  if(at >= 0){
    if(v) source.lines[at] = key + ': ' + v;
    else source.lines = source.lines.filter((_, index) => !matching.includes(index));
    return joinLines(source);
  }
  if(!v) return text;
  const anchor = afterKeys.map(candidate => source.lines.map((line, index) =>
    new RegExp('^' + candidate + '\\s*:', 'i').test(line.trim()) ? index : -1
  ).filter(index => index >= 0).at(-1) ?? -1).find(index => index >= 0) ?? -1;
  source.lines.splice(anchor + 1, 0, key + ': ' + v);
  return joinLines(source);
}

export function editLabel(line, oldRaw, newRaw){
  const note = line.match(/\s\/\/\s?.*$/);
  const body = note ? line.slice(0, note.index) : line;
  const arrow = body.match(/\s->\s+\S+\s*$/);
  if(!arrow) return line;
  const head = body.slice(0, arrow.index);
  const lane = head.match(/^(\s*[^:]+:\s*)(.*)$/);
  const prefix = lane ? lane[1] : head.slice(0, head.length - head.trimStart().length);
  const label = lane ? lane[2] : head.slice(prefix.length);
  if(label.trim() !== oldRaw) return line;
  const trailing = label.match(/\s*$/)?.[0] ?? '';
  return prefix + newRaw.trim() + trailing + body.slice(arrow.index) + (note?.[0] ?? '');
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
  return setConfigValue(text, 'question', value, ['title']);
}

/* status is a config line, like question. Keep the artefact picker complete
   even when the source omitted the key (the parser's default is `open`). */
export function setStatus(text, value){
  const v = String(value).trim().toLowerCase();
  if(!['open', 'decided', 'parked'].includes(v)) return text;
  return setConfigValue(text, 'status', v, ['question', 'title']);
}

export function setTitle(text, value){
  return setConfigValue(text, 'title', value);
}

export function setVerdict(text, value){
  return setConfigValue(text, 'verdict', value, ['status', 'question', 'title']);
}

export function addExhibitLine(text){
  const lines = String(text).split(/\r?\n/);
  let afterLine = -1;
  for(let i = lines.length - 1; i >= 0; i--) {
    if(lines[i].trim()) { afterLine = i; break; }
  }
  return {afterLine, newLine: 'New exhibit -> /fermi/'};
}
