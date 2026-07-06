/* /risk DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../../assets/editor-common.js';
export {insertAndSelect} from '../../assets/editor-common.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      if(stream.string.trim().startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(stream.match(/^\s*(title|palette|accent|unit|merchant|floor|toll|insure)\s*:/i)) return 'keyword';
    }
    if(stream.match(/^\/\/.*$/)) return 'comment';
    if(stream.match(/^"[^"]*"/)) return 'string';
    if(stream.match(/^(share|fee|premium|attach|limit)\b/i)) return 'atom';
    if(stream.match(/^-?\d+(\.\d+)?%?/)) return 'number';
    if(stream.match(/^\.\./)) return 'meta';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [
    {tag: t.atom, color: 'var(--muted)', fontWeight: '600'},
    {tag: t.number, color: 'var(--st-done)', fontWeight: '600'},
    {tag: t.string, color: 'var(--accent-ink)'},
    {tag: t.meta, color: 'var(--muted)'},
  ]});
