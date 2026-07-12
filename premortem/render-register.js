/* The living register table (HTML string): ranked by median exposure, an inline
   P10–P90 band bar, staleness class + text marker, status pill, tag/cluster chips,
   the portfolio line with its independence caveat, and a stale-count nag. */
import {esc} from '../assets/svg.js';
import {fmt} from '../assets/series.js';
import {ranked, staleness, staleCount} from './register.js';

const scoreable = e => Array.isArray(e.p) && Array.isArray(e.impact);

export function renderRegister(doc, exp, now = new Date()){
  const rows = ranked(doc.entries || [], exp);
  const u = doc.unit ? ' ' + esc(doc.unit) : '';
  const port = exp.portfolio || {p50: 0, p10: 0, p90: 0};
  const stale = staleCount(doc.entries || [], now);
  const maxP90 = Math.max(1, ...rows.filter(scoreable).map(e => (exp.get(e.id) || {}).p90 || 0));

  const body = rows.map((e, i) => {
    const sc = scoreable(e);
    const x = sc ? (exp.get(e.id) || {p50: 0, p10: 0, p90: 0}) : null;
    const st = staleness(e, now);
    const bandX = sc ? (x.p10 / maxP90 * 100).toFixed(1) : 0;
    const bandW = sc ? Math.max(2, (x.p90 - x.p10) / maxP90 * 100).toFixed(1) : 0;
    const acts = e.actions.length;
    return '<tr class="rrow ' + st + '" data-id="' + e.id + '">' +
      '<td class="rnum">' + (i + 1) + '</td>' +
      '<td class="rtext">' + esc(e.text) +
        (e.tag ? '<span class="tagchip ' + e.tag + '">' + esc(e.tag.replace('-', ' ')) + '</span>' : '') +
        (e.cluster ? '<span class="clusterchip">' + esc(e.cluster) + '</span>' : '') +
        (acts ? '<span class="actcount">' + acts + ' action' + (acts === 1 ? '' : 's') + '</span>' : '') + '</td>' +
      '<td class="rexp">' + (sc
        ? '<b>' + fmt(x.p50) + '</b><span class="band" title="P10–P90"><span class="bandfill" style="left:' +
          bandX + '%;width:' + bandW + '%"></span></span><span class="bandtext">' + fmt(x.p10) + '–' + fmt(x.p90) + '</span>'
        : '<span class="unscored">unscored</span>') + '</td>' +
      '<td class="rp">' + (e.p ? e.p[0] + '–' + e.p[1] + '%' : '—') + '</td>' +
      '<td><span class="statuspill ' + e.status + '">' + esc(e.status) + '</span></td>' +
      '<td class="rstale">' + st + (st !== 'fresh' ? ' <span class="stalemark">·</span>' : '') + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="registerwrap"><table class="register"><thead><tr>' +
    '<th></th><th>Risk</th><th>Exposure' + u + '</th><th>Likely</th><th>Status</th><th>Age</th></tr></thead>' +
    '<tbody>' + body + '</tbody></table></div>' +
    '<p class="portfolio">Portfolio exposure <b>' + fmt(port.p50) + u + '</b> [' + fmt(port.p10) + '–' + fmt(port.p90) +
      '] — the sum if every risk landed independently; correlated risks stack higher than this.</p>' +
    (stale ? '<p class="stalenag">' + stale + ' risk' + (stale === 1 ? '' : 's') +
      ' not reviewed in 90 days — a stale register lies. Review them or close them.</p>' : '') +
    '<div class="actions">' +
    '<button class="btn" data-act="copylink">Copy link</button>' +
    '<button class="btn" data-act="copydoc">Copy for a doc</button>' +
    '<button class="btn" data-act="reviewall">Mark all reviewed today</button>' +
    '<span class="method">Seeded Monte Carlo · the register lives in this browser; a link imports a copy</span></div>';
}
