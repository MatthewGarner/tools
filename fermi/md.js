/* Fermi's Markdown copy. One escaping rule for authored text: a backslash before each of \ | * _ ` [ ] < > and no HTML entities.
   Rank has its own copy of mdEscape (rank/md.js); the two must stay identical (a test holds them together). */
export const mdEscape = s => String(s ?? '').replace(/[\\|*_`\[\]<>]/g, '\\$&');

/* data: {question, unit, formula, p10, p50, p90, ratio, threshold: {text, pct} | null, vars: [{name, lo, hi, uniform, receipt}],
   lever, pour, confession, compare: {a, b, pct} | null, method, link}. Figures arrive as the page prints them. */
export function estimateMarkdown(d){
  const lines = [];
  if(d.question) lines.push(mdEscape(d.question), '');
  if(d.unit) lines.push('Results in ' + mdEscape(d.unit), '');
  lines.push('**Estimate — `' + d.formula + '`**', '');
  let head = 'P50 ≈ **' + d.p50 + '** · 80% range ' + d.p10 + ' – ' + d.p90;
  if(d.ratio) head += ' (spread ×' + d.ratio + ')';
  lines.push(head);
  if(d.threshold) lines.push('P(> ' + mdEscape(d.threshold.text) + ') = ' + d.threshold.pct);
  lines.push('');
  lines.push('Assumptions (90% intervals' + (d.vars.some(v => v.uniform) ? '; a uniform input is its full range' : '') + '):');
  for(const v of d.vars) lines.push('- ' + mdEscape(v.name) + ': ' + mdEscape(v.lo) + ' – ' + mdEscape(v.hi) + (v.uniform ? ' (uniform, full range)' : '') + ' — ' + mdEscape(v.receipt));
  if(d.lever){ lines.push('', mdEscape(d.lever)); }
  if(d.pour){ lines.push('', mdEscape(d.pour)); }
  if(d.confession){ lines.push('', mdEscape(d.confession)); }
  if(d.compare){
    lines.push('', 'Model variant A P50 ' + d.compare.a + ' vs model variant B P50 ' + d.compare.b +
      ' — independently sampled B outputs exceed A in ' + d.compare.pct + '. This is sensitivity analysis, not a chance state.');
  }
  lines.push('', '_' + mdEscape(d.method) + ' · [live model](' + d.link + ')_');
  return lines.join('\n');
}
