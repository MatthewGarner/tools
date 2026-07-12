/* Pure HTML string builders for /duel: the two-card duel, the implied-order list,
   the loop report, and a markdown export. All item text through esc(). */
import {esc} from '../assets/svg.js';
import {active, impliedOrder, settledness, loops, budget} from './engine.js';

const loserOf = x => x.w === x.a ? x.b : x.a;
const NUM = {2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight'};

export function renderDuel(state, pair){
  const n = state.items.length;
  const activeCount = active(state.duels).length;
  const card = i => '<button class="card" data-pick="' + i + '">' + esc(state.items[i]) + '</button>';
  return '<p class="framing">' + esc(state.q || 'Which comes first?') + '</p>' +
    '<div class="duelcards">' + card(pair[0]) + '<span class="vs">or</span>' + card(pair[1]) + '</div>' +
    '<p class="progress">duel ' + (activeCount + 1) + ' of ~' + budget(n) + '</p>';
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
    const mush = settled[pos] === 'mushy' ? '<span class="mushmark" aria-hidden="true">~</span>' : '';
    return '<li class="' + cls + '"><span class="rank">' + o.rank + '</span>' +
      '<span class="olabel">' + esc(state.items[o.idx]) + '</span>' + mush +
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
  const ls = loops(n, state.duels);
  const out = ['# ' + (state.q || 'Pairwise showdown'), '', '## Implied order', ''];
  order.forEach(o => out.push(o.rank + '. ' + state.items[o.idx] + ' (' + (o.score > 0 ? '+' : '') + o.score + ')'));
  if(ls.length){
    out.push('', '## Loops (no clean order)', '');
    ls.forEach(loop => {
      const tri = loop.triangles[0] || [...loop.members].slice(0, 3);
      out.push('- ' + tri.map(x => state.items[x]).join(' → ') + ' → ' + state.items[tri[0]]);
    });
  }
  if(href) out.push('', '[Open in the pairwise showdown](' + href + ')');
  return out.join('\n') + '\n';
}
