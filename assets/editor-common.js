/* Shared CodeMirror core for the DSL tools: one theme, one extension set,
   one line-edit API. Tools own only their language definition and highlight
   accents (token colours differ per DSL — only keyword/comment are universal). */
import {EditorState, Compartment, EditorView, keymap, drawSelection,
  highlightActiveLine, defaultKeymap, history, historyKeymap,
  StreamLanguage, syntaxHighlighting, HighlightStyle, tags}
  from '../roadmap/vendor/codemirror.js';

export {StreamLanguage, Compartment, tags};

/* Most DSL editors are just a language + highlight accents on the shared core —
   makeEditor collapses that wrapper (roadmap keeps its own: dynamic horizons). */
export function makeEditor({lang, highlights = [], indentBar = false}){
  return ({parent, doc, onChange}) =>
    createEditorCore({parent, doc, onChange, langExtension: lang,
      extraHighlights: highlights, indentBar});
}

/* ---- indentation: the DSLs speak 2-space indents; Tab/Shift-Tab move whole
   lines by one unit (Matt's 2026-07-06 usability note). Pure core, view shims. */
export const INDENT_UNIT = '  ';
export function indentChanges(state, dir){
  const changes = [];
  const seen = new Set();
  for(const r of state.selection.ranges){
    const fromL = state.doc.lineAt(r.from).number, toL = state.doc.lineAt(r.to).number;
    for(let n = fromL; n <= toL; n++){
      if(seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      if(dir > 0) changes.push({from: line.from, insert: INDENT_UNIT});
      else {
        const m = line.text.match(/^(\t| {1,2})/);
        if(m) changes.push({from: line.from, to: line.from + m[0].length});
      }
    }
  }
  return changes.length ? changes : null;
}
const indentCmd = dir => view => {
  const changes = indentChanges(view.state, dir);
  if(!changes) return dir < 0;          // swallow Shift-Tab; let a no-op Tab still indent
  view.dispatch({changes, scrollIntoView: true});
  return true;
};
export const indentMore = indentCmd(1);
export const indentLess = indentCmd(-1);

/* Rule 2 (mobile input): phones have no ⌘Z, so "every edit is an undoable text
   rewrite" needs a visible control. The pinned vendor bundle doesn't export
   undo/redo — but historyKeymap (already imported) carries the Mod-z binding
   whose `run` IS @codemirror/commands' undo; calling it through the keymap
   reuses the shipped bytes instead of rebuilding + re-pinning the vendor.
   Resolved once at module load so a repinned bundle that dropped the binding
   fails loudly at import time, not silently at tap time. */
const undoBinding = historyKeymap.find(k => k.key === 'Mod-z');
if(!undoBinding) throw new Error('editor-common: vendored historyKeymap lost its Mod-z binding');
const undoCmd = undoBinding.run;

export const BASE_HIGHLIGHTS = [
  {tag: tags.keyword, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: tags.comment, color: 'var(--muted)', opacity: '0.55'},
];

const cmTheme = EditorView.theme({
  '&': {backgroundColor: 'var(--bg)', color: 'var(--ink)', fontSize: '13px',
    border: '1px solid var(--border)', borderRadius: '6px', minHeight: '440px'},
  '.cm-content': {fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    padding: '12px 0', lineHeight: '1.6', caretColor: 'var(--ink)'},
  '.cm-line': {padding: '0 12px'},
  '&.cm-focused': {outline: '2px solid var(--accent)', outlineOffset: '2px'},
  '.cm-activeLine': {backgroundColor: 'rgba(120,150,175,0.07)'},
  '.cm-cursor': {borderLeftColor: 'var(--ink)'},
  '&.cm-focused .cm-selectionBackground, ::selection':
    {backgroundColor: 'rgba(60,140,190,0.28)'},
});

export function createEditorCore({parent, doc, langExtension, onChange, extraHighlights = [],
  indentBar = false}){
  /* Every tool sets aria-label on the #cmhost wrapper, but that name never reaches
     CM6's own contenteditable textbox (a wrapper's label doesn't cascade to a nested
     role=textbox). Lift it onto the content element via CM's native facet so a SR
     user hears "<Tool> source editor" instead of an unlabelled text box. */
  const ariaLabel = parent.getAttribute('aria-label') || undefined;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        ...(ariaLabel ? [EditorView.contentAttributes.of({'aria-label': ariaLabel})] : []),
        langExtension,
        syntaxHighlighting(HighlightStyle.define([...BASE_HIGHLIGHTS, ...extraHighlights])),
        history(),
        drawSelection(),
        highlightActiveLine(),
        /* Tab/Shift-Tab own indentation (before defaultKeymap so nothing shadows
           them). Keyboard users escape the trap the standard CM way: Esc, then Tab. */
        keymap.of([{key: 'Tab', run: indentMore, shift: indentLess},
          ...defaultKeymap, ...historyKeymap]),
        cmTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => { if(u.docChanged) onChange(); }),
      ],
    }),
  });
  if(indentBar){
    /* fingers have no Tab key: two fat buttons, shown only on coarse pointers
       (CSS in workspace.css) */
    const bar = document.createElement('div');
    bar.className = 'cm-indentbar';
    for(const [label, cmd, aria] of [['⇤ outdent', indentLess, 'Outdent line'],
        ['indent ⇥', indentMore, 'Indent line']]){
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', () => { cmd(view); view.focus(); });
      bar.appendChild(b);
    }
    parent.insertBefore(bar, parent.firstChild);
  }
  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: text => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}}),
    replaceLine(n, text){
      const line = view.state.doc.line(n + 1);
      view.dispatch({changes: {from: line.from, to: line.to, insert: text}});
    },
    getLine(n){ return view.state.doc.line(n + 1).text; },
    /* The touch Undo button is the only caller. undoCmd itself doesn't focus, but
       undoing an add restores a selection INTO the editor, which CM can focus to
       show the caret — raising the phone's soft keyboard over the artefact. So on a
       coarse pointer, blur the contentDOM straight back if the undo grabbed it.
       Returns whether anything was undone (no-op on an empty history). */
    undo(){
      const r = undoCmd(view);
      if(matchMedia('(pointer: coarse)').matches && document.activeElement === view.contentDOM) view.contentDOM.blur();
      return r;
    },
    insertLinesAfter(n, texts){
      const line = view.state.doc.line(n + 1);
      view.dispatch({changes: {from: line.to, to: line.to, insert: '\n' + texts.join('\n')}});
    },
    removeLine(n){
      const line = view.state.doc.line(n + 1);
      const from = line.from > 0 ? line.from - 1 : line.from;
      const to = line.from > 0 ? line.to : Math.min(line.to + 1, view.state.doc.length);
      view.dispatch({changes: {from, to, insert: ''}});
    },
    removeLines(a, b){   /* inclusive 0-based range, e.g. a whole subtree */
      const first = view.state.doc.line(a + 1), last = view.state.doc.line(b + 1);
      const from = first.from > 0 ? first.from - 1 : first.from;
      const to = first.from > 0 ? last.to : Math.min(last.to + 1, view.state.doc.length);
      view.dispatch({changes: {from, to, insert: ''}});
    },
    dispatchEffects: effects => view.dispatch({effects}),
  };
}

/* Non-contiguous line ops as ONE change set: every range is computed against
   the original doc (no shifting), one dispatch = one history event. Runs of
   ADJACENT deletions coalesce into a single range — per-line delete ranges
   share their boundary newline and CM6 rejects overlapping changes. */
export function lineOpsChanges(state, ops){
  const sorted = [...ops].sort((a, b) => a.line - b.line);
  for(let i = 1; i < sorted.length; i++)
    if(sorted[i].line === sorted[i - 1].line) throw new Error('duplicate line op: ' + sorted[i].line);
  const changes = [];
  for(let i = 0; i < sorted.length; i++){
    const op = sorted[i];
    if(op.text !== null){
      const l = state.doc.line(op.line + 1);       // CM lines are 1-based
      changes.push({from: l.from, to: l.to, insert: op.text});
      continue;
    }
    let end = i;                                    // extend over the run of consecutive deletes
    while(end + 1 < sorted.length && sorted[end + 1].text === null &&
          sorted[end + 1].line === sorted[end].line + 1) end++;
    const first = state.doc.line(op.line + 1), last = state.doc.line(sorted[end].line + 1);
    const from = first.number > 1 ? state.doc.line(first.number - 1).to : first.from;
    const to = first.number > 1 ? last.to : Math.min(last.to + 1, state.doc.length);
    changes.push({from, to, insert: ''});
    i = end;
  }
  return changes;
}
export function applyLineOps(editor, ops){
  editor.view.dispatch({changes: lineOpsChanges(editor.view.state, ops)});
}

/* Insert a line after afterLine, then select `select` (or the whole new line)
   inside it and focus — the add-from-the-diagram affordance the DSL tools share.
   The caret lands on the placeholder so typing replaces it immediately. */
export function insertAndSelect(editor, afterLine, newLine, select, {focus = true} = {}){
  editor.insertLinesAfter(afterLine, [newLine]);
  const ln = editor.view.state.doc.line(afterLine + 2);
  const text = select || newLine;
  const idx = select ? Math.max(0, newLine.indexOf(select)) : 0;
  editor.view.dispatch({selection: {anchor: ln.from + idx, head: ln.from + idx + text.length}});
  // focus lands the caret on the placeholder to type it — a desktop convenience. On a
  // COARSE pointer it yanks focus into the DSL and raises the soft keyboard over the
  // artefact the user is editing in place; suppress it there (they tap the new item to
  // name it in place instead). (mobile-input focus fix, 2026-07-16)
  if(focus && !matchMedia('(pointer: coarse)').matches) editor.view.focus();
}
