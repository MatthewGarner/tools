/* Timeline DSL language on the shared editor core. */
import {makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';
export {insertAndSelect} from '../assets/editor-common.js';
import {STATUSES, parseLead, parseStarted} from './parse.js';

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|palette|accent|font|style|today|verdict)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
      const lane = stream.match(/^\s*[^:\[\d][^:\[]*?:\s/, true);
      if(lane) return 'labelName';
    }
    if(stream.match(/^\d{4}-\d{2}(-\d{2})?/)) return 'number';
    if(stream.match(/^\.\./)) return 'meta';
    if(stream.match(/^\[[^\]]+\]/)){
      const tag = stream.current().slice(1, -1).trim().toLowerCase();
      const lead = tag.match(/^lead\s*:\s*(.*)$/), started = tag.match(/^started\s*:\s*(.*)$/);
      return STATUSES.includes(tag) || (lead && parseLead(lead[1]) !== null) ||
        (started && parseStarted(started[1]) !== null) ? 'atom' : 'invalid';
    }
    if(stream.match(/^\/\/.*$/)) return 'comment';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});

export const createEditor = makeEditor({lang,
  highlights: [
    {tag: t.labelName, color: 'var(--muted)', fontWeight: '600'},
    {tag: t.number, color: 'var(--st-done)', fontWeight: '600'},
    {tag: t.atom, color: 'var(--accent-ink)', fontWeight: '600'},
    {tag: t.invalid, color: 'var(--err)'},
    {tag: t.meta, color: 'var(--muted)'},
  ]});
