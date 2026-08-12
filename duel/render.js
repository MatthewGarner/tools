/* Pure HTML string builders for /duel: the two-card duel, the implied-order list,
   the loop report, and a markdown export. All item text through esc(). */
import {esc} from '../assets/svg.js';
import {active, impliedOrder, settledness, loops, budget, minDuels, verdictParts} from './engine.js';

const loserOf = x => x.w === x.a ? x.b : x.a;
const NUM = {2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight'};

/* The running state's anatomy (Swiss 6c, Claude Design file 33): each card is a
   CONTENDER kicker over the name over a PICK affordance; the progress line is an
   uppercase micro on a plain ink hairline meter. DOM text stays sentence case —
   the CSS does the uppercasing, so copy-for-a-doc and AT read normal words.
   `budget(n)` is exact for n ≤ 7 (a full round robin) and an estimate above it,
   so the "~" and the note only claim what is true. */
export function renderDuel(state, pair){
  const n = state.items.length;
  const activeCount = active(state.duels).length;
  const total = budget(n);
  const exact = n <= 7;
  const pct = Math.max(0, Math.min(100, Math.round(activeCount / total * 100)));
  const card = i => '<button class="pickcard" data-pick="' + i + '">' +
    '<span class="ckick">Contender</span>' +
    '<span class="cname">' + esc(state.items[i]) + '</span>' +
    '<span class="cpick">Pick</span></button>';
  return '<p class="framing">' + esc(state.q || 'Which comes first?') + '</p>' +
    '<div class="duelcards">' + card(pair[0]) + '<span class="vs">vs</span>' + card(pair[1]) + '</div>' +
    '<div class="progress"><span class="pnote">Duel ' + (activeCount + 1) + ' of ' +
      (exact ? '' : '~') + total + ' · ' +
      (exact ? 'every pair meets once' : 'the most informative pairs first') + '</span>' +
      '<span class="ppct">' + pct + '% complete</span></div>' +
    '<div class="ptrack"><div class="pfill" style="width:' + pct + '%"></div></div>';
}

export function renderOrder(state){
  const n = state.items.length;
  const order = impliedOrder(n, state.duels);
  const settled = settledness(n, state.duels);
  const rankN = {};
  order.forEach(o => { rankN[o.rank] = (rankN[o.rank] || 0) + 1; });
  const rows = order.map((o, pos) => {
    const tie = rankN[o.rank] > 1;
    const cls = ['orow', settled[pos], tie ? 'tie' : ''].filter(Boolean).join(' ');
    const stateLabel = settled[pos] === 'settled' ? 'Neighbours compared' : 'Needs direct comparison';
    return '<li class="' + cls + '"><span class="rank">' + o.rank + '</span>' +
      '<span class="olabel">' + esc(state.items[o.idx]) + '</span>' +
      '<span class="statepill ' + settled[pos] + '">' + stateLabel + '</span>' +
      '<span class="oscore">' + (o.score > 0 ? '+' : '') + o.score + '</span></li>';
  });
  return '<ol class="orderlist">' + rows.join('') + '</ol>';
}

export function renderLoops(state){
  const n = state.items.length;
  const ls = loops(n, state.duels);
  if(!ls.length) return '';
  const act = active(state.duels);
  const tagOf = (w, l) => { const dl = act.find(x => x.w === w && loserOf(x) === l); return dl && dl.tag; };
  return ls.map((loop, li) => {
    const tri = loop.triangles[0] || [...loop.members].slice(0, 3);
    const knot = loop.members.length > 3
      ? '<p class="knot">a knot of ' + loop.members.length + ' items</p>' : '';
    const cycle = tri.map(x => esc(state.items[x])).join(' → ') + ' → ' + esc(state.items[tri[0]]);
    const edges = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    const tags = edges.map(([w, l]) => tagOf(w, l));
    const chips = edges.map(([w, l], ei) => tags[ei]
      ? '<span class="tagchip">on ' + esc(tags[ei]) + '</span>'
      : '<button class="tagbtn" data-w="' + w + '" data-l="' + l + '">name it</button>').join('');
    const synth = tags.every(Boolean)
      ? '<p class="synth">' + (NUM[edges.length] || edges.length) + ' criteria pretending to be one.</p>' : '';
    return '<div class="loop">' + knot + '<p class="cycle">' + cycle + '</p>' +
      '<div class="edges">' + chips + '</div>' + synth +
      '<button class="reduel" data-loop="' + li + '">re-duel this loop</button></div>';
  }).join('');
}

export function markdown(state, href){
  const n = state.items.length;
  const order = impliedOrder(n, state.duels);
  const settled = settledness(n, state.duels);
  const ls = loops(n, state.duels);
  const remaining = Math.max(0, minDuels(n) - active(state.duels).length);
  const verdict = verdictParts(order, settled, ls, remaining);
  const text = value => String(value || '').replace(/([\\`*_[\]<>])/g, '\\$1');
  const out = ['# ' + text(state.q || 'Pairwise showdown'), '',
    '## Confidence in this current order', '', verdict.line, '',
    '## Current implied order', ''];
  order.forEach((o, pos) => out.push(o.rank + '. ' + text(state.items[o.idx]) + ' — ' +
    (settled[pos] === 'settled' ? 'neighbours compared' : 'needs a direct comparison') +
    ' (' + (o.score > 0 ? '+' : '') + o.score + ')'));
  if(ls.length){
    out.push('', '## Loops (no clean order)', '');
    ls.forEach(loop => {
      const tri = loop.triangles[0] || [...loop.members].slice(0, 3);
      out.push('- ' + tri.map(x => text(state.items[x])).join(' → ') + ' → ' + text(state.items[tri[0]]));
    });
  }
  if(href) out.push('', '[Open in the pairwise showdown](' + href + ')');
  return out.join('\n') + '\n';
}
