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
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
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

/* Insert a line after afterLine, then select `select` (or the whole new line)
   inside it and focus — the add-from-the-diagram affordance the DSL tools share.
   The caret lands on the placeholder so typing replaces it immediately. */
export function insertAndSelect(editor, afterLine, newLine, select){
  editor.insertLinesAfter(afterLine, [newLine]);
  const ln = editor.view.state.doc.line(afterLine + 2);
  const text = select || newLine;
  const idx = select ? Math.max(0, newLine.indexOf(select)) : 0;
  editor.view.dispatch({selection: {anchor: ln.from + idx, head: ln.from + idx + text.length}});
  editor.view.focus();
}
