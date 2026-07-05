/* Roadmap DSL language on the shared editor core. Horizons are dynamic, so the
   language lives in a Compartment and setHorizons reconfigures it. */
import {createEditorCore, StreamLanguage, Compartment, tags as t} from '../assets/editor-common.js';
import {STATUS_ALIASES, DEFAULT_HORIZONS} from './parse.js';

function makeLang(horizons){
  const hset = new Set(horizons.map(h => h.toLowerCase()));
  return StreamLanguage.define({
    token(stream){
      if(stream.sol()){
        const line = stream.string.trim();
        if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
        if(/^(title|date|horizons|wip|fade|palette|accent)\s*:/i.test(line)){
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
      if(stream.match(/^\s->\s+\S+\s*$/)) return 'link';
      if(stream.match(/^\s--\s.*$/)) return 'meta';
      stream.next();
      return null;
    },
    languageData: {commentTokens: {line: '//'}},
  });
}

export function createEditor({parent, doc, onChange}){
  const langComp = new Compartment();
  let currentHorizons = [...DEFAULT_HORIZONS];
  const core = createEditorCore({parent, doc, onChange,
    langExtension: langComp.of(makeLang(currentHorizons)),
    extraHighlights: [
      {tag: t.heading, fontWeight: '700'},
      {tag: t.labelName, color: 'var(--muted)', fontWeight: '600'},
      {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
      {tag: t.invalid, color: 'var(--err)'},
      {tag: t.link, color: 'var(--accent-ink)', textDecoration: 'underline'},
      {tag: t.meta, color: 'var(--muted)'},
    ]});
  return {
    ...core,
    setHorizons(names){
      const key = names.join('|').toLowerCase();
      if(key === currentHorizons.join('|').toLowerCase()) return;
      currentHorizons = [...names];
      core.dispatchEffects(langComp.reconfigure(makeLang(names)));
    },
  };
}
