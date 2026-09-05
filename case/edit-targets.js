import {CONFIG_KEYS, BLOCK_FIELDS, parse} from './parse.js';
/* Pure text rewrites for /case edit-in-place. No DOM; the text is the model. */

const CONFIG_LINE = new RegExp('^(' + CONFIG_KEYS.join('|') + ')\\s*:', 'i');

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


// A config-like word may be an indented review field or a legacy exhibit lane.
// Native edits must use precisely the same declaration boundaries as parsing.
function configIndices(lines, key){
  let block = false;
  const found = [];
  for(let index = 0; index < lines.length; index++){
    const raw = lines[index], line = raw.trim();
    if(!line || line.startsWith('//')) continue;
    if(block && /^\s/.test(raw)) continue;
    block = /^(option|claim|review)\s+[a-z][a-z0-9_-]*\s*:/i.test(line);
    if(block) continue;
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if(!match || match[1].toLowerCase() !== key) continue;
    const legacyLane = !['title', 'question', 'status', 'verdict', 'palette', 'accent'].includes(key) && /\s->\s+\S+(?:\s+\/\/.*)?$/.test(match[2]);
    if(!legacyLane) found.push(index);
  }
  return found;
}

function setConfigValue(text, key, value, afterKeys = []){
  const source = textLines(text);
  const matching = configIndices(source.lines, key);
  // The parser makes the last duplicate config line authoritative, so native
  // edits must target the same one. Clearing removes every duplicate to avoid
  // revealing an older hidden value instead of the requested empty state.
  const at = matching.at(-1) ?? -1;
  const v = String(value).trim();
  if(at >= 0){
    if(v){
      const comment = source.lines[at].match(/(\s\/\/.*)$/);
      source.lines[at] = key + ': ' + v + (comment ? comment[0] : '');
    }
    else source.lines = source.lines.filter((_, index) => !matching.includes(index));
    return joinLines(source);
  }
  if(!v) return text;
  const anchor = afterKeys.map(candidate => configIndices(source.lines, candidate).at(-1) ?? -1).find(index => index >= 0) ?? -1;
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


/* All helpers return source text for the app's ordinary undoable dispatch. */
export function setConfig(text, key, value){
  if(!CONFIG_KEYS.includes(key) || /[\r\n]/.test(String(value)) || hasConfigComment(value)) return text;
  return setConfigValue(text, key, value, ['title']);
}

export function setBlockField(text, kind, id, key, value){
  if(!BLOCK_FIELDS[kind] || !['label', ...BLOCK_FIELDS[kind]].includes(key) || /[\r\n]/.test(String(value)) || hasConfigComment(value)) return text;
  const source = textLines(text);
  const collection = parse(text)[kind === 'option' ? 'options' : kind === 'claim' ? 'claims' : 'reviews'];
  const start = collection.find(node => node.id === id)?.srcLine ?? -1;
  if(start < 0) return text;
  if(key === 'label'){
    source.lines[start] = kind + ' ' + id + ': ' + String(value).trim();
    return joinLines(source);
  }
  let end = start + 1;
  while(end < source.lines.length && (!source.lines[end].trim() || /^\s/.test(source.lines[end]) || /^\/\//.test(source.lines[end]))) end++;
  const matches = [];
  for(let i = start + 1; i < end; i++) if(new RegExp('^\\s+' + key + '\\s*:', 'i').test(source.lines[i])) matches.push(i);
  const val = String(value).trim();
  if(val){
    const at = matches.at(-1);
    if(at == null) source.lines.splice(start + 1, 0, '  ' + key + ': ' + val);
    else source.lines[at] = '  ' + key + ': ' + val;
  }else source.lines = source.lines.filter((_, index) => !matches.includes(index));
  return joinLines(source);
}

export function appendBlock(text, kind, values = {}){
  if(!BLOCK_FIELDS[kind]) return text;
  const label = String(values.label || 'New ' + kind);
  if(/[\r\n]/.test(label) || hasConfigComment(label)) return text;
  const source = String(text), ids = new Set([...source.matchAll(/^(?:option|claim|review)\s+([a-z][a-z0-9_-]*)\s*:/gmi)].map(match => match[1]));
  let id = values.id || kind, suffix = 2;
  if(!/^[a-z][a-z0-9_-]*$/i.test(id)) return text;
  const base = id;
  while(ids.has(id)) id = base + '-' + suffix++;
  const lines = [kind + ' ' + id + ': ' + label];
  for(const key of BLOCK_FIELDS[kind]){
    const value = String(values[key] || '');
    if(/[\r\n]/.test(value) || hasConfigComment(value)) return text;
    if(value) lines.push('  ' + key + ': ' + value);
  }
  const ending = source.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(/\s*$/, '') + ending + ending + lines.join(ending);
}
