/* Rank's Markdown copy. One escaping rule for authored text: a backslash before each of \ | * _ ` [ ] < > and no HTML entities.
   Fermi has its own copy of mdEscape (fermi/md.js); the two must stay identical (a test holds them together). */
export const mdEscape = s => String(s ?? '').replace(/[\\|*_`\[\]<>]/g, '\\$&');
/* a table cell also folds line breaks */
export const mdCell = s => mdEscape(String(s ?? '').replace(/\r?\n/g, ' '));

/* d: {criteria: [{name, w}], effort: {name, w}, items: [{name, s: [...], e}], k, ww, sw, nsim, rows: [{pos, name, med, p10, p90, ptop, knife}],
   verdict, flip, wobble, runs (e.g. "16,000 simulations"), link}. Everything the page shows and what produced it: the capacity, the criteria with their weights, each
   initiative's scores and effort, and the knife-edge flags. */
export function rankMarkdown(d){
  const k = d.k, n = d.items.length, lines = [];
  lines.push('**Prioritisation — top ' + k + ' of ' + n + ' initiative' + (n === 1 ? '' : 's') + ' make the cut (rank stability check)**', '');
  lines.push('Criteria and weights: ' + d.criteria.map(c => mdEscape(c.name) + ' ' + c.w).join(' · ') + ' · ÷ ' + mdEscape(d.effort.name) + ' ' + d.effort.w, '');
  lines.push('| # | Initiative | Median rank | 90% rank range | P(top-' + k + ') | Flag |');
  lines.push('|---|---|---|---|---|---|');
  for(const r of d.rows) lines.push('| ' + r.pos + ' | ' + mdCell(r.name) + ' | ' + r.med + ' | ' + r.p10 + '–' + r.p90 + ' | ' + r.ptop + ' | ' + (r.knife ? 'knife-edge' : '') + ' |');
  lines.push('');
  lines.push('Inputs (scores 1–10):', '');
  lines.push('| Initiative | ' + d.criteria.map(c => mdCell(c.name)).join(' | ') + ' | ' + mdCell(d.effort.name) + ' |');
  lines.push('|---|' + d.criteria.map(() => '---|').join('') + '---|');
  for(const it of d.items) lines.push('| ' + mdCell(it.name) + ' | ' + it.s.join(' | ') + ' | ' + it.e + ' |');
  lines.push('');
  lines.push(mdEscape(d.verdict));
  if(d.flip){ lines.push('', mdEscape(d.flip)); }
  lines.push('', '_' + mdEscape(d.wobble) + ', ' + d.runs + ' · [live table](' + d.link + ')_');
  return lines.join('\n');
}
