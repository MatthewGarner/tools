/* Tree DSL language on the shared editor core. */
import {createEditorCore, StreamLanguage, tags as t} from '../assets/editor-common.js';

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

export function createEditor({parent, doc, onChange}){
  return createEditorCore({parent, doc, onChange, langExtension: lang, indentBar: true,
    extraHighlights: [
      {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
      {tag: t.number, color: 'var(--st-done)', fontWeight: '600'},
    ]});
}
