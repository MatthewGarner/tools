/* Shared authored-verdict editing (2026-08-02): the pure text rewrite and the
   menu rows behind the verdict edit target, once — seven tools wire them.

   setVerdictText mirrors roadmap's setConfigKey semantics, which review proved
   are the only safe ones: every parser is silently LAST-wins on duplicate
   `verdict:` lines, so setting rewrites the LAST match (the one that actually
   wins) and clearing deletes EVERY match (delete only the winner and an earlier
   dead line takes over — the value the author just cleared comes straight
   back). Insertion lands in the config block: after any leading config lines
   (`configRe`, the tool's own key set), before the first content line. */

export function setVerdictText(text, value, configRe){
  const v = value == null ? '' : String(value).replace(/[\r\n]+/g, ' ').trim();
  const line = 'verdict: ' + v;
  if(!String(text).trim()) return v ? line : text;
  const lines = String(text).split(/\r?\n/);
  const re = /^verdict\s*:/i;
  const hits = [];
  for(let i = 0; i < lines.length; i++)
    if(re.test(lines[i].trim())) hits.push(i);
  if(hits.length){
    if(!v){ for(let i = hits.length - 1; i >= 0; i--) lines.splice(hits[i], 1); }
    else {
      /* preserve a trailing comment — the value is the author's, the aside too */
      const old = lines[hits[hits.length - 1]];
      const cm = old.match(/(\s\/\/.*)$/);
      lines[hits[hits.length - 1]] = line + (cm ? cm[1] : '');
    }
    return lines.join('\n');
  }
  if(!v) return text;
  let at = lines.length;
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim();
    if(!t || t.startsWith('//')) continue;
    if(configRe && configRe.test(t)) continue;
    at = i; break;
  }
  lines.splice(at, 0, line);
  return lines.join('\n');
}

/* The menu the verdict target opens (Matt 2026-08-02: menu-first everywhere).
   `authoredRaw` is the parser's raw model.verdict — null/undefined when the key
   is absent, which is what gates the conditional rows. */
export function verdictMenuRows(authoredRaw){
  const present = authoredRaw != null;
  const t = present ? String(authoredRaw).trim() : '';
  const isOff = present && (t === '' || t.toLowerCase() === 'off');
  const rows = [
    {label: 'Edit the line…', opens: 'verdictedit'},
    {label: 'Copy line', commit: {kind: 'verdictcopy', line: -1, oldRaw: '', value: ''}},
  ];
  if(present) rows.push({label: "Use the tool's line", commit: {kind: 'verdictclear', line: -1, oldRaw: '', value: ''}});
  if(!isOff) rows.push({label: 'Off', commit: {kind: 'verdictoff', line: -1, oldRaw: '', value: ''}});
  return rows;
}

/* One onCommit fragment, shared shape: apps call this from their onCommit with
   their own editor/getLine plumbing. Returns true when the kind was ours. */
export function handleVerdictCommit(kind, value, {getText, setText, configRe, getLine}){
  if(kind === 'verdictedit'){
    setText(setVerdictText(getText(), value.trim() || null, configRe));
  } else if(kind === 'verdictclear'){
    setText(setVerdictText(getText(), null, configRe));
  } else if(kind === 'verdictoff'){
    setText(setVerdictText(getText(), 'off', configRe));
  } else if(kind === 'verdictcopy'){
    const line = getLine();
    if(line) navigator.clipboard?.writeText(line).catch(() => prompt('Copy this:', line));
  } else return false;
  return true;
}

/* validator for the verdictedit input: empty is legal (= use the tool's line);
   a value that would parse as a comment is not a verdict */
export const validVerdictInput = v => !String(v).trim().startsWith('//');
