/* Pure text export/import so the clipboard surface can be regression-tested.
   Markdown stays readable while carrying the roadmap facts that would otherwise
   disappear outside the SVG: bets, conditions, authored spans and safe links. */
import {STATUS_LABEL, DEFAULT_HORIZONS, genHorizons} from './parse.js';

const STATUS_FROM_LABEL = {'done':'done','in progress':'doing','doing':'doing','at risk':'risk','risk':'risk','blocked':'blocked'};

const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

/* Keep Markdown readable by omitting the ordinary Now/Next/Later axis, but
   preserve every non-default axis before its headings. Generated axes need
   their generating declaration back: emitting only "Aug 2026" headers would
   make the target a manual axis and turn xN spans into broken title text. */
function horizonsLine(model){
  const horizons = Array.isArray(model.horizons) ? model.horizons : [];
  if(same(horizons, DEFAULT_HORIZONS)) return '';
  if(model.timeAxis && horizons.length >= 2){
    const first = String(horizons[0] || '');
    const monthly = /^([A-Za-z]+)\s+(\d{4})$/.test(first)
      ? 'monthly from ' + first + ' x' + horizons.length : '';
    const quarterly = /^Q[1-4]\s+\d{4}$/i.test(first)
      ? 'quarterly from ' + first + ' x' + horizons.length : '';
    for(const candidate of [monthly, quarterly]){
      if(candidate && same(genHorizons(candidate) || [], horizons)) return candidate;
    }
  }
  return horizons.join(', ');
}

function basisLine(basis){
  if(!basis) return '';
  const clauses = ['paths "' + basis.source + '"'];
  for(const kind of ['answered', 'assumed']){
    const entries = Array.isArray(basis[kind]) ? basis[kind] : [];
    if(entries.length) clauses.push(kind + ' ' + entries.map(entry =>
      entry.key + '=' + entry.direction + '@' + entry.date).join(', '));
  }
  return clauses.join('; ');
}

function itemMetadata(it){
  const parts = [];
  if(it.status && STATUS_LABEL[it.status]) parts.push('_(' + STATUS_LABEL[it.status].toLowerCase() + ')_');
  if(it.bet) parts.push('[bet: ' + it.bet.name + (it.bet.outcome ? ' ' + it.bet.outcome : '') + ']');
  if(it.cond) parts.push('[' + it.cond.when + ' ' + it.cond.name + ']');
  if(Number.isInteger(it.declaredSpan) && it.declaredSpan > 1) parts.push('x' + it.declaredSpan);
  return parts.length ? ' ' + parts.join(' ') : '';
}

export function roadmapToMarkdown(model, {href = '', includeStory = false} = {}){
  const lines = [];
  if(model.title) lines.push('## ' + model.title, '');
  for(const key of ['font', 'palette', 'accent', 'style', 'focus', 'group']){
    if(model[key] && model[key] !== ({font:'Chapter',palette:'ocean',group:'lane'})[key]) lines.push('`' + key + ': ' + model[key] + '`', '');
  }
  const axis = horizonsLine(model);
  if(axis) lines.push('`horizons: ' + axis + '`', '');
  const basis = basisLine(model.basis);
  if(basis) lines.push('`basis: ' + basis + '`', '');
  if(model.headline) lines.push('_' + model.headline + '_', '');
  if(includeStory && model.story) lines.push('> ' + model.story, '');
  model.horizons.forEach((hName, h) => {
    const inH = model.items.filter(it => it.h === h);
    if(!inH.length) return;
    lines.push('### ' + hName, '');
    for(const lane of model.lanes){
      for(const it of inH.filter(item => item.lane === lane)){
        let line = '- ' + (lane ? '**' + lane + ':** ' : '') + it.title + itemMetadata(it);
        if(it.note) line += ' — ' + it.note;
        if(it.url && /^https?:\/\/\S+$/i.test(it.url)) line += ' -> ' + it.url;
        lines.push(line);
      }
    }
    lines.push('');
  });
  lines.push('_[Live roadmap](' + href + ')_');
  return lines.join('\n');
}

/* Accept both the established human-only form and roadmapToMarkdown's richer
   form. Bet/condition/span tokens remain in `item`; parse() owns their meaning. */
export function markdownToRoadmapDsl(md){
  const out = [], config = [];
  for(const raw of md.split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    let m;
    if((m = line.match(/^##\s+(.*)$/)) && !line.startsWith('###')){ config.push('title: ' + m[1].trim()); continue; }
    if((m = line.match(/^`?(horizons|basis|font|palette|accent|style|focus|group):\s*(.*?)`?$/i))){
      const rawValue = m[2].trim().replace(/`$/, '');
      config.push(m[1].toLowerCase() + ': ' + rawValue); continue;
    }
    if((m = line.match(/^###\s+(.*)$/))){ out.push('', m[1].trim()); continue; }
    if((m = line.match(/^[-*]\s+(.*)$/))){
      let item = m[1].trim();
      let lane = '', status = '', note = '', url = '';
      const laneM = item.match(/^\*\*(.+?):?\*\*:?\s+(.*)$/);
      if(laneM){ lane = laneM[1].replace(/:$/, ''); item = laneM[2]; }
      const linkM = item.match(/\s->\s+(https?:\/\/\S+)\s*$/i);
      if(linkM){ url = ' -> ' + linkM[1]; item = item.slice(0, linkM.index).trim(); }
      const stM = item.match(/_\(([^)]+)\)_/);
      if(stM){
        const st = STATUS_FROM_LABEL[stM[1].toLowerCase().trim()];
        if(st) status = ' [' + st + ']';
        item = (item.slice(0, stM.index).trimEnd() + ' ' +
          item.slice(stM.index + stM[0].length).trimStart()).trim();
      }
      const noteM = item.match(/^(.*?)\s+—\s+(.*)$/);
      if(noteM){ item = noteM[1].trim(); note = ' -- ' + noteM[2].trim(); }
      out.push((lane ? lane + ': ' : '') + item + status + note + url);
    }
  }
  return [...config, ...out].join('\n');
}
