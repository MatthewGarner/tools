/* Map DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^zone\s+[^:]+:/i.test(line)){ stream.match(/^\s*zone\s+[^:]+:/i); return 'heading'; }
      if(/^(preset|title|palette|accent|x|y|zones)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^@\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/)) return 'atom';
    if(stream.match(/^::\s*[\w-]+\s*:/)) return 'meta';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [
      {tag: t.heading, color: 'var(--accent-ink)', fontWeight: '700'},
      {tag: t.atom, color: 'var(--st-done)', fontWeight: '600'},
      {tag: t.meta, color: 'var(--muted)'},
    ]});
