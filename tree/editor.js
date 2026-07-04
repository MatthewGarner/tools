/* CodeMirror setup for the tree DSL. Same vendored bundle and theme as roadmap. */
import {EditorState, EditorView, keymap, drawSelection,
  highlightActiveLine, defaultKeymap, history, historyKeymap,
  StreamLanguage, syntaxHighlighting, HighlightStyle, tags as t}
  from '../roadmap/vendor/codemirror.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|currency|palette|accent)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^\(p=[^)]+\)/)) return 'atom';
    if(stream.match(/^:\s*[£$€]?-?[\d.]+[kKmMbB]?(\s+to\s+[£$€]?-?[\d.]+[kKmMbB]?|\s*-\s*[£$€]?[\d.]+[kKmMbB]?)?\s*$/)) return 'number';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

const highlightStyle = HighlightStyle.define([
  {tag: t.keyword, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.number, color: 'var(--st-done)', fontWeight: '600'},
  {tag: t.comment, color: 'var(--muted)', opacity: '0.55'},
]);

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

export function createEditor({parent, doc, onChange}){
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lang, syntaxHighlighting(highlightStyle),
        history(), drawSelection(), highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmTheme, EditorView.lineWrapping,
        EditorView.updateListener.of(u => { if(u.docChanged) onChange(); }),
      ],
    }),
  });
  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: text => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}}),
    replaceLine(n, text){
      const line = view.state.doc.line(n + 1);
      view.dispatch({changes: {from: line.from, to: line.to, insert: text}});
    },
    getLine(n){
      return view.state.doc.line(n + 1).text;
    },
  };
}
