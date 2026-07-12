/* Bets DSL language on the shared editor core. Tokens: config keys
   (title:/unit:/palette:/accent:, indent 0), group headings (indent 0,
   plain text — no special token, they're just a name), attribute keywords
   (stake/odds/payoff, anywhere after a bet's `:`), `kill:` (indent 4) and
   `// comments`. Mirrors wardley/editor.js's shape (no dynamic state here,
   so the simple makeEditor wrapper is enough — roadmap's Compartment
   reconfiguration is only needed for horizons, which bets has none of). */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';

const CONFIG = /^(title|unit|palette|accent)\s*:/i;
const ATTR = /^(stake|odds|payoff)\b/i;

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string;
      const indent = (line.match(/^ */) || [''])[0].length;
      const trimmed = line.trim();
      if(trimmed.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(indent === 0 && CONFIG.test(trimmed)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
      if(indent >= 4 && /^kill\s*:/i.test(trimmed)){
        stream.match(/^\s*kill\s*:/i); return 'keyword';
      }
    }
    if(stream.match(/^\/\/.*$/)) return 'comment';
    if(stream.match(ATTR)) return 'atom';
    if(stream.match(/^\bby\b(?=\s+\d{4}-\d{2}-\d{2})/)) return 'meta';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang, indentBar: true,
  highlights: [
    {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
    {tag: t.meta, color: 'var(--muted)', fontWeight: '600'},
  ]});
