/* Why DSL language on the shared editor core. */
import {createEditorCore, StreamLanguage, tags as t} from '../assets/editor-common.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|palette|accent)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
      if(/^outcome\s*:/i.test(line)){ stream.match(/^\s*outcome\s*:/i); return 'heading'; }
      if(stream.match(/^\s*\?/)) return 'meta';
    }
    if(stream.match(/^\[broken\]/)) return 'invalid';
    if(stream.match(/^\[[^\]]+\]/)) return 'atom';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export function createEditor({parent, doc, onChange}){
  return createEditorCore({parent, doc, onChange, langExtension: lang, indentBar: true,
    extraHighlights: [
      {tag: t.heading, color: 'var(--accent-ink)', fontWeight: '700'},
      {tag: t.atom, color: 'var(--st-done)', fontWeight: '600'},
      {tag: t.invalid, color: 'var(--err)', fontWeight: '600'},
      {tag: t.meta, color: 'var(--muted)'},
    ]});
}
