/* Case-file DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(option|claim|review)\s+/i.test(line)){ stream.match(/^\s*(option|claim|review)\s+[^:]+:/i); return 'keyword'; }
      if(/^(title|question|status|verdict|palette|accent|headline|decision|unresolved|owner|date|review-by|reconsider|constraints|view|font|theme|basis|detail|qualification|assumptions|url|value|requires|downside|change|implication|previous)\s*:/i.test(line)){
        stream.match(/^\s*[a-z-]+\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^->\s*\S+/)) return 'atom';        // the link — the exhibit's whole point
    if(stream.match(/^\s\/\/.*$/) || stream.match(/^\/\/.*$/)) return 'comment';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [
    {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
  ]});
