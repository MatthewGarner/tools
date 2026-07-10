/* Wardley DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';
import {STAGES} from './parse.js';

const STAGE_WORDS = new RegExp('^(' + STAGES.map(s => s.name).join('|') + ')\\b', 'i');

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|palette|accent|anchor)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^->/)) return 'meta';
    if(stream.match(/^@\s*/)){
      if(stream.match(STAGE_WORDS)) return 'atom';
      if(stream.match(/^[\d.]+/)) return 'number';
      return 'invalid';
    }
    if(stream.match(/^\/\/.*$/)) return 'comment';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [
    {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
    {tag: t.number, color: 'var(--st-done)', fontWeight: '600'},
    {tag: t.invalid, color: 'var(--err)'},
    {tag: t.meta, color: 'var(--muted)', fontWeight: '600'},
  ]});
