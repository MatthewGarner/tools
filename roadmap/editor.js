/* CodeMirror 6 setup: roadmap language, CSS-variable theme, createEditor API. */
import {EditorState, Compartment, EditorView, keymap, drawSelection,
  highlightActiveLine, defaultKeymap, history, historyKeymap,
  StreamLanguage, syntaxHighlighting, HighlightStyle, tags as t}
  from './vendor/codemirror.js';
import {STATUS_ALIASES, DEFAULT_HORIZONS} from './parse.js';

function makeLang(horizons){
  const hset = new Set(horizons.map(h => h.toLowerCase()));
  return StreamLanguage.define({
    token(stream){
      if(stream.sol()){
        const line = stream.string.trim();
        if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
        if(/^(title|date|horizons|wip|fade)\s*:/i.test(line)){
          stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
        }
        if(hset.has(line.replace(/:$/, '').toLowerCase())){ stream.skipToEnd(); return 'heading'; }
        const lane = stream.match(/^\s*[^[\]:]+?:\s/, true);
        if(lane) return 'labelName';
      }
      if(stream.match(/^\[[^\]]+\]/)){
        const tag = stream.current().slice(1, -1).trim().toLowerCase();
        return STATUS_ALIASES[tag] ? 'atom' : 'invalid';
      }
      if(stream.match(/^\s--\s.*$/)) return 'meta';
      stream.next();
      return null;
    },
    languageData: {commentTokens: {line: '//'}},
  });
}

const highlightStyle = HighlightStyle.define([
  {tag: t.keyword, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.heading, fontWeight: '700'},
  {tag: t.labelName, color: 'var(--muted)', fontWeight: '600'},
  {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
  {tag: t.invalid, color: 'var(--err)'},
  {tag: t.meta, color: 'var(--muted)'},
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
  const langComp = new Compartment();
  let currentHorizons = [...DEFAULT_HORIZONS];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        langComp.of(makeLang(currentHorizons)),
        syntaxHighlighting(highlightStyle),
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => { if(u.docChanged) onChange(); }),
      ],
    }),
  });
  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: text => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}}),
    setHorizons(names){
      const key = names.join('|').toLowerCase();
      if(key === currentHorizons.join('|').toLowerCase()) return;
      currentHorizons = [...names];
      view.dispatch({effects: langComp.reconfigure(makeLang(names))});
    },
  };
}
