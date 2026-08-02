/* Try-it specimens (2026-08-02): the syntax reference's <code> specimens insert
   into the editor, so first-run and phone users compose a document by tapping
   shapes. Pure placement logic here (node-tested); the wiring is one delegated
   listener per page — CSP-clean, no inline handlers.

   Placement: a CONFIG specimen (its key is in the tool's configKeys list)
   REPLACES the last existing line for that key (a second `wip:` line is a
   warning, not help), else lands in the config block — after leading config,
   before the first content line. A NODE specimen inserts after the cursor's
   line (end of doc when empty), and the caller selects it so the next
   keystroke replaces the placeholder text. */

export function planInsert(text, cursorLine, specimen, configKeys = []){
  const spec = String(specimen).trim();
  if(!spec) return null;
  const lines = String(text).split(/\r?\n/);
  const km = spec.match(/^([a-z][a-z-]*)\s*:/i);
  const key = km && configKeys.includes(km[1].toLowerCase()) ? km[1].toLowerCase() : null;
  if(key){
    const re = new RegExp('^' + key + '\\s*:', 'i');
    let last = -1;
    for(let i = 0; i < lines.length; i++) if(re.test(lines[i].trim())) last = i;
    if(last >= 0) return {op: 'replace', line: last, text: spec};
    if(!text.trim()) return {op: 'prepend', text: spec};
    const anyKey = new RegExp('^(' + configKeys.join('|') + ')\\s*:', 'i');
    let at = lines.length;
    for(let i = 0; i < lines.length; i++){
      const t = lines[i].trim();
      if(!t || t.startsWith('//') || anyKey.test(t)) continue;
      at = i; break;
    }
    return at === 0 ? {op: 'prepend', text: spec} : {op: 'insert', afterLine: at - 1, text: spec};
  }
  if(!text.trim()) return {op: 'prepend', text: spec};
  const after = Math.max(0, Math.min(cursorLine ?? lines.length - 1, lines.length - 1));
  return {op: 'insert', afterLine: after, text: spec};
}

function selectLine(editor, n){
  const doc = editor.view.state.doc;
  const line = doc.line(Math.min(n + 1, doc.lines));
  editor.view.dispatch({selection: {anchor: line.from, head: line.to}, scrollIntoView: true});
}

export function wireSyntaxTry(container, editor, configKeys){
  if(!container) return;
  container.addEventListener('click', e => {
    const code = e.target.closest && e.target.closest('code[data-try]');
    if(!code || !container.contains(code)) return;
    const text = editor.getText();
    const doc = editor.view.state.doc;
    const cursorLine = doc.lineAt(editor.view.state.selection.main.head).number - 1;
    const plan = planInsert(text, cursorLine, code.textContent, configKeys);
    if(!plan) return;
    if(plan.op === 'replace'){ editor.replaceLine(plan.line, plan.text); selectLine(editor, plan.line); }
    else if(plan.op === 'prepend'){ editor.setText(text.trim() ? plan.text + '\n' + text : plan.text); selectLine(editor, 0); }
    else { editor.insertLinesAfter(plan.afterLine, [plan.text]); selectLine(editor, plan.afterLine + 1); }
  });
}
