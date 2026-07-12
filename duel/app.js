/* DOM shell: setup → duel loop → live readout. Engine + renderers are pure;
   this file owns the DOM, the duel log, hash state, tag/re-duel edits, keyboard. */
import {nextPair, minDuels, budget, active, impliedOrder, settledness, loops, verdictCopy} from './engine.js';
import {renderDuel, renderOrder, renderLoops, markdown} from './render.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {debounced} from '../assets/schedule.js';

const $ = id => document.getElementById(id);
const EXAMPLE = {q: 'Which should we build first?',
  items: ['Streak freeze', 'Habit templates', 'Smart reminders', 'Accountability circles', 'Progress cards']};

let state = {q: '', items: [], duels: [], finished: false};
let curPair = null;
const writeHash = debounced(() => writeHashState(state), 300);

function n(){ return state.items.length; }

function render(){
  const started = n() >= 3;
  $('setupcard').hidden = started;
  $('duelcard').hidden = !started;
  $('readoutcard').hidden = !started;
  if(!started){ curPair = null; return; }

  curPair = state.finished ? null : nextPair(n(), state.duels);
  if(curPair){
    $('duelwrap').innerHTML = renderDuel(state, curPair);
  } else {
    $('duelwrap').innerHTML = '<p class="framing">All duelled — the order below is as firm as it gets.</p>' +
      '<p class="progress">' + active(state.duels).length + ' duels recorded.</p>';
  }
  // finish/keep visibility
  const canFinish = !state.finished && active(state.duels).length >= minDuels(n());
  $('finish').hidden = !canFinish;
  $('keep').hidden = !(state.finished || (!curPair && active(state.duels).length < budget(n()) * 3));
  $('undo').disabled = active(state.duels).length === 0;

  // readout
  const order = impliedOrder(n(), state.duels);
  const ls = loops(n(), state.duels);
  const settled = settledness(n(), state.duels);
  const remaining = Math.max(0, minDuels(n()) - active(state.duels).length);
  $('verdict').textContent = verdictCopy(order, settled, ls, remaining);
  $('orderwrap').innerHTML = renderOrder(state);
  $('loopcol').hidden = ls.length === 0;
  $('loopwrap').innerHTML = renderLoops(state);
  writeHash();
}

/* ---------- setup ---------- */
function parseItems(text){
  const seen = new Set(), out = [];
  for(const raw of text.split('\n')){
    const t = raw.trim();
    if(!t) continue;
    const k = t.toLowerCase();
    if(seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  return out;
}
$('start').addEventListener('click', () => {
  const items = parseItems($('items').value);
  const warn = $('setupwarn');
  if(items.length < 3){ warn.textContent = 'Add at least 3 contenders (one per line).'; warn.hidden = false; return; }
  let capped = items;
  if(items.length > 20){ warn.textContent = 'Keeping the first 20 — more than that is a lot of duels.'; warn.hidden = false; capped = items.slice(0, 20); }
  else warn.hidden = true;
  state = {q: $('question').value.trim(), items: capped, duels: [], finished: false};
  render();
});
$('restart').addEventListener('click', () => {
  $('question').value = state.q;
  $('items').value = state.items.join('\n');
  state = {q: '', items: [], duels: [], finished: false};
  writeHashState(state);
  render();
});

/* ---------- duelling ---------- */
$('duelwrap').addEventListener('click', e => {
  const btn = e.target.closest('[data-pick]');
  if(!btn || !curPair) return;
  const w = +btn.dataset.pick;
  state.duels.push({a: curPair[0], b: curPair[1], w});
  state.finished = false;
  render();
});
$('undo').addEventListener('click', () => {
  for(let i = state.duels.length - 1; i >= 0; i--){ if(!state.duels[i].sup){ state.duels.splice(i, 1); break; } }
  render();
});
$('finish').addEventListener('click', () => { state.finished = true; render(); });
$('keep').addEventListener('click', () => { state.finished = false; render(); });

/* keyboard: ← / → pick the left / right card while a duel is showing */
document.addEventListener('keydown', e => {
  if(!curPair || $('duelcard').hidden) return;
  if(e.key === 'ArrowLeft'){ e.preventDefault(); pick(curPair[0]); }
  else if(e.key === 'ArrowRight'){ e.preventDefault(); pick(curPair[1]); }
});
function pick(w){ state.duels.push({a: curPair[0], b: curPair[1], w}); state.finished = false; render(); }

/* ---------- tag + re-duel (delegated on the loop column) ---------- */
$('loopwrap').addEventListener('click', e => {
  const tagBtn = e.target.closest('.tagbtn');
  if(tagBtn){ openTagEdit(tagBtn); return; }
  const re = e.target.closest('.reduel');
  if(re){ reduelLoop(+re.dataset.loop); return; }
});
function openTagEdit(btn){
  const w = +btn.dataset.w, l = +btn.dataset.l;
  const wrap = document.createElement('span');
  wrap.className = 'tagedit';
  wrap.innerHTML = '<input type="text" maxlength="24" placeholder="the criterion — cost? speed?" aria-label="Name the criterion">';
  btn.replaceWith(wrap);
  const input = wrap.querySelector('input');
  input.focus();
  const commit = () => {
    const tag = input.value.trim();
    if(tag){
      const dl = active(state.duels).find(x => x.w === w && (x.w === x.a ? x.b : x.a) === l);
      if(dl) dl.tag = tag;
    }
    render();
  };
  input.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); commit(); } else if(ev.key === 'Escape') render(); });
  input.addEventListener('blur', commit);
}
function reduelLoop(li){
  const ls = loops(n(), state.duels);
  const loop = ls[li];
  if(!loop) return;
  const tri = loop.triangles[0] || [...loop.members].slice(0, 3);
  const edges = new Set([tri[0] + '>' + tri[1], tri[1] + '>' + tri[2], tri[2] + '>' + tri[0]]);
  for(const x of state.duels){
    if(x.sup) continue;
    const key = x.w + '>' + (x.w === x.a ? x.b : x.a);
    if(edges.has(key)) x.sup = true;
  }
  state.finished = false;
  render();
}

/* ---------- exports ---------- */
$('copydoc').addEventListener('click', async () => {
  const md = markdown(state, location.href);
  try{ await navigator.clipboard.writeText(md); flash('copydoc', 'Copied'); }
  catch(e){ prompt('Copy this:', md); }
});
$('copylink').addEventListener('click', async () => {
  try{ await navigator.clipboard.writeText(location.href); flash('copylink', 'Copied'); }
  catch(e){ prompt('Copy this link:', location.href); }
});
function flash(id, msg){ const b = $(id), was = b.textContent; b.textContent = msg; setTimeout(() => { b.textContent = was; }, 1500); }

/* ---------- examples ---------- */
const ex = document.createElement('button');
ex.className = 'chip';
ex.textContent = 'Habit app features';
ex.addEventListener('click', () => { $('question').value = EXAMPLE.q; $('items').value = EXAMPLE.items.join('\n'); $('setupwarn').hidden = true; });
$('examples').appendChild(ex);

/* ---------- boot ---------- */
(function boot(){
  const h = readHashState();
  if(h && Array.isArray(h.items) && h.items.length >= 3 && Array.isArray(h.duels)){
    state = {q: h.q || '', items: h.items.map(String), duels: h.duels, finished: !!h.finished};
    render();
  } else {
    // open alive: prefill the setup form with the example (not auto-started)
    $('question').value = EXAMPLE.q;
    $('items').value = EXAMPLE.items.join('\n');
    render();
  }
})();
