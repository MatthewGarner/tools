/* Gauge DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';
export {insertAndSelect} from '../assets/editor-common.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|names|palette|accent)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^::\s*(prob|range\b[^/]*)\s*$/i)) return 'atom';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [{tag: t.atom, color: 'var(--st-done)', fontWeight: '600'}]});
