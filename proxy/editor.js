/* Proxy Hunt DSL highlighting on the shared CodeMirror core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';

const TOP = /^(title|date|outcome|proxy|action|mode|optimisation-pressure|trade-off|decision-rule|verdict|palette|accent)\s*:/i;
const BLOCK = /^(intended-theory|protects|failure-theory(?:\s+[^:]+)?|reported-pattern)\s*:/i;
const CHILD = /^\s{2}(mechanism|harmed-outcome|guardrail|basis|support|weaken-with|proxy-reading|outcome-reading|protected-outcome-reading|outcome|population|horizon|comparator|source)\s*:/i;

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(TOP.test(line)){ stream.match(/^\s*[a-z][\w-]*\s*:/i); return 'keyword'; }
      if(BLOCK.test(line)){ stream.match(/^\s*(?:intended-theory|protects|failure-theory(?:\s+[^:]+)?|reported-pattern)\s*:/i); return 'heading'; }
      if(CHILD.test(stream.string)){ stream.match(/^\s*[a-z][\w-]*\s*:/i); return 'meta'; }
      if(/^\s{2}-\s+/.test(stream.string)){ stream.match(/^\s*-\s+/); return 'atom'; }
    }
    if(stream.match(/^(?:reasoned-mechanism|speculative-concern|optimise|monitor)\b/i)) return 'atom';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang, indentBar:true, highlights:[
  {tag:t.heading, color:'var(--accent-ink)', fontWeight:'700'},
  {tag:t.meta, color:'var(--muted)', fontWeight:'600'},
  {tag:t.atom, color:'var(--st-blocked-ink)', fontWeight:'650'},
]});
