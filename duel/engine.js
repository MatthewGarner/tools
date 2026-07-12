/* Pairwise-showdown engine. Pure — no DOM. Duels are index-based numeric objects
   {a, b, w} (w is a or b; the winner), optionally {sup:true} (superseded by a
   re-duel) and {tag} (a criterion named on a loop edge). Item labels never appear
   here. Copeland over DIRECTLY observed duels only; Tarjan for intransitivity. */

export const active = duels => duels.filter(x => !x.sup);
const other = x => x.w === x.a ? x.b : x.a;

/* wins − losses per item over active duels */
export function copeland(n, duels){
  const s = new Array(n).fill(0);
  for(const x of active(duels)){ s[x.w]++; s[other(x)]--; }
  return s;
}

/* sorted [{idx, score, rank}]; equal scores share a rank (competition ranking) */
export function impliedOrder(n, duels){
  const s = copeland(n, duels);
  const idx = Array.from({length: n}, (_, i) => i).sort((p, q) => s[q] - s[p] || p - q);
  const out = []; let rank = 1;
  idx.forEach((i, pos) => {
    if(pos > 0 && s[i] < s[idx[pos - 1]]) rank = pos + 1;
    out.push({idx: i, score: s[i], rank});
  });
  return out;
}

/* iterative Tarjan SCCs over the beats-digraph (winner → loser) */
function tarjan(n, adj){
  const idx = new Array(n).fill(-1), low = new Array(n).fill(-1), onStk = new Array(n).fill(false);
  const stk = [], out = [];
  let counter = 0;
  for(let start = 0; start < n; start++){
    if(idx[start] !== -1) continue;
    const call = [{v: start, i: 0}];
    while(call.length){
      const frame = call[call.length - 1], v = frame.v;
      if(frame.i === 0){ idx[v] = low[v] = counter++; stk.push(v); onStk[v] = true; }
      if(frame.i < adj[v].length){
        const w = adj[v][frame.i++];
        if(idx[w] === -1) call.push({v: w, i: 0});
        else if(onStk[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        if(low[v] === idx[v]){
          const comp = []; let w;
          do { w = stk.pop(); onStk[w] = false; comp.push(w); } while(w !== v);
          out.push(comp);
        }
        call.pop();
        if(call.length){ const p = call[call.length - 1].v; low[p] = Math.min(low[p], low[v]); }
      }
    }
  }
  return out;
}

/* SCCs of size ≥ 3 (the intransitive knots), each with its 3-cycles enumerated */
export function loops(n, duels){
  const adj = Array.from({length: n}, () => []);
  const beats = new Set();
  for(const x of active(duels)){
    const l = other(x);
    adj[x.w].push(l); beats.add(x.w + '>' + l);
  }
  return tarjan(n, adj).filter(c => c.length >= 3).map(members => {
    const m = [...members].sort((a, b) => a - b);
    const tri = [];
    for(let i = 0; i < m.length; i++) for(let j = 0; j < m.length; j++) for(let k = 0; k < m.length; k++){
      if(i === j || j === k || i === k) continue;
      if(m[i] < m[j] && m[i] < m[k] &&                   // canonical start avoids rotations
         beats.has(m[i] + '>' + m[j]) && beats.has(m[j] + '>' + m[k]) && beats.has(m[k] + '>' + m[i]))
        tri.push([m[i], m[j], m[k]]);
    }
    return {members, triangles: tri};
  });
}

/* per rank-position 'settled' | 'mushy': settled iff every neighbour in the order
   was directly duelled AND the higher-ranked one won (spec §"Settled vs mushy") */
export function settledness(n, duels){
  const order = impliedOrder(n, duels);
  const act = active(duels);
  const provenAdj = pos => {                    // adjacency (pos, pos+1) proven?
    const a = order[pos].idx, b = order[pos + 1].idx;
    const dl = act.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    return !!dl && dl.w === a;                   // the earlier (higher-ranked) item must have won
  };
  return order.map((_, pos) => {
    const leftOk = pos === 0 || provenAdj(pos - 1);
    const rightOk = pos === order.length - 1 || provenAdj(pos);
    return leftOk && rightOk ? 'settled' : 'mushy';
  });
}

/* one quotable verdict line. `settled` is the settledness() array (or null). */
export function verdictCopy(order, settled, loopsFound, remainingBudget){
  if(loopsFound && loopsFound.length)
    return 'No clean order — ' + loopsFound.length + ' loop' + (loopsFound.length === 1 ? '' : 's') +
      ': different criteria are in play.';
  if(!order.length) return 'Add some items to line up.';
  if(settled && settled.length && settled.every(x => x === 'settled'))
    return 'The order is settled — every adjacent pair was duelled.';
  const firm = remainingBudget > 0
    ? ' — ' + remainingBudget + ' more duel' + (remainingBudget === 1 ? '' : 's') + ' would firm it up.'
    : ' — a few more duels would firm it up.';
  const topSettled = settled && settled[0] === 'settled';
  return (topSettled ? 'The top is settled, but the middle is mushy' : 'The order is still provisional') + firm;
}
