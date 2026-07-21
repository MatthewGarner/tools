/* /signal-vs-noise — the only DOM-touching layer. State machine:
   play (judge quarter) → reveal (how your calls landed, no truth) → … → done
   (the collapse verdict, truth revealed). Nothing here computes truth; it all
   comes from the pure, seeded engine. URL carries {seed, params, calls}. */
import {makeScenario, verdict, revealFor, funnelRatio, AUTHORED_SEED} from './engine.js';
import {renderGrid, renderCollapse} from './render.js';
import {themeColors, onThemeChange, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {debounced} from '../assets/schedule.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), reveal = $('reveal'), nextBtn = $('next'), hint = $('hint'),
      controls = $('controls'), endcard = $('endcard'), lessonsEl = $('lessons');

let seed = AUTHORED_SEED, params = {}, calls = [], turn = 0, phase = 'play', lessons = [];
let cols = 3;   // grid columns; a ResizeObserver flips 3→2→1 on a container bucket (narrow relayout)
const colsFor = w => w && w < 430 ? 1 : w && w < 620 ? 2 : 3;   // portrait phones (incl. large) → 1 touch-sized col

const scenario = () => makeScenario(seed, params);
const dedupe = cs => [...new Map(cs.map(c => [c.person + ':' + c.quarter, c])).values()];
// the wrong "lesson" a call teaches, or null — the quoted, regressed illusion.
// Shared by the live reveal and the shared-URL reconstruction (loadHash).
const lessonLabel = r => r.illusion && r.illusion.startsWith('“')
  ? (r.kind === 'praise' ? 'Praise breeds complacency' : 'Tough love works') : null;

/* ---------- URL state ---------- */
function loadHash(){
  const st = readHashState();
  if(!st || typeof st.seed !== 'number') return;
  seed = st.seed;
  // Number.isFinite (not typeof) rejects NaN; clamp keeps a hand-crafted noiseSd
  // from overflowing the band arithmetic to Infinity → NaN chart coords.
  params = st.params && Number.isFinite(st.params.noiseSd)
    ? {noiseSd: Math.min(8, Math.max(1, st.params.noiseSd))} : {};
  const s = scenario();   // a hostile URL must never brick the page: bound person/quarter to this scenario
  calls = Array.isArray(st.calls)
    ? dedupe(st.calls.filter(c => c && Number.isInteger(c.person) && c.person >= 0 && c.person < s.people
        && Number.isInteger(c.quarter) && c.quarter >= 0 && c.quarter < s.quarters))
    : [];
  phase = calls.length ? 'done' : 'play';   // a shared/replayed run opens on its verdict
  turn = 0;
  // reconstruct the wrong-lessons ledger so a shared URL's collapse copy is faithful
  lessons = [];
  for(const {person, quarter} of [...calls].sort((a, b) => a.quarter - b.quarter)){
    const l = lessonLabel(revealFor(s, person, quarter));
    if(l && !lessons.includes(l)) lessons.push(l);
  }
}
const saveRun = () => writeHashState({seed, ...(params.noiseSd ? {params: {noiseSd: params.noiseSd}} : {}),
  ...(calls.length ? {calls} : {})});

/* ---------- turn loop ---------- */
function startPlay(newSeed){
  if(newSeed != null) seed = newSeed;
  calls = []; turn = 0; phase = 'play'; lessons = [];
  writeHashState({seed, ...(params.noiseSd ? {params: {noiseSd: params.noiseSd}} : {})});
  render();
}

function toggleCall(p, q, act){
  if(phase !== 'play' || q !== turn) return;
  const same = c => c.person === p && c.quarter === q;
  const has = calls.some(same);
  if(act === 'talk' && !has) calls = [...calls, {person: p, quarter: q}];
  else if(act === 'leave' && has) calls = calls.filter(c => !same(c));
  else return;
  render();
}

stage.addEventListener('click', e => {
  const g = e.target.closest('[data-act]');
  if(g) toggleCall(+g.dataset.person, +g.dataset.quarter, g.dataset.act);
});
stage.addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const g = e.target.closest && e.target.closest('[data-act]');
  if(g){ e.preventDefault(); toggleCall(+g.dataset.person, +g.dataset.quarter, g.dataset.act); }
});

nextBtn.addEventListener('click', () => {
  const s = scenario();
  if(phase === 'reveal'){ turn++; phase = 'play'; render(); return; }
  if(turn < s.quarters - 1){ buildReveal(s, turn); phase = 'reveal'; render(); }
  else { calls = dedupe(calls); phase = 'done'; saveRun(); render(); }
});

/* the between-turn reveal — how the people you talked to moved next quarter, in
   the tempting language of cause and effect. No ground truth escapes here. */
function buildReveal(s, q){
  const acted = calls.filter(c => c.quarter === q);
  const cards = acted.map(({person}) => {
    const r = revealFor(s, person, q);
    if(r.next === null) return '';
    const l = lessonLabel(r);
    if(l && !lessons.includes(l)) lessons.push(l);
    return '<div class="rvl-card' + (l ? ' lesson' : '') + '">' +
      '<div class="rvl-top"><span class="rvl-name">' + s.names[person] + '</span>' +
      '<span class="rvl-move">' + s.shown[person][q] + ' → ' + r.next + '</span></div>' +
      '<p>' + r.illusion + '</p></div>';
  }).join('');
  const led = lessons.length
    ? '<div class="rvl-ledger"><span class="rvl-led-h">What you’re learning about your team:</span> ' +
      lessons.map(l => '<span class="chip">' + l + '</span>').join(' ') + '</div>'
    : '';
  reveal.innerHTML = acted.length
    ? '<h3>Quarter ' + (q + 2) + ' — how your conversations landed</h3>' +
      '<div class="rvl-cards">' + cards + '</div>' + led
    : '<h3>Quarter ' + (q + 2) + '</h3><p class="rvl-none">You left everyone alone — no conversations to follow up.</p>' + led;
}

/* ---------- collapse copy ---------- */
function lessonsLine(){
  if(!calls.length)
    return 'You left every swing alone — no tampering, no false lessons. That is the discipline the band is trying to teach.';
  if(!lessons.length)
    return 'No tidy “lesson” stuck this run — but that’s the luck of the draw, not skill. React to enough noise and the false lessons arrive.';
  const strike = lessons.map(l => '<s>' + l + '</s>').join(', ');
  return 'The lessons this game was teaching you — ' + strike +
    ' — were regression to the mean, not cause and effect. Only one thing on this team truly changed, and no conversation caused it.';
}

function markdown(){
  const s = scenario(), v = verdict(s, calls), f = funnelRatio(s);
  return ['**Signal vs noise — ' + s.people + ' people, ' + s.quarters + ' quarters**', '',
    v.line, '',
    '- ' + v.falseAlarms + ' of your ' + calls.length + ' conversations chased noise the process would have produced anyway.',
    '- ' + v.correctHolds + ' noise readings correctly left alone.',
    '- Re-aiming targets to each quarter’s number opens a gap with ' + (f.ratio ? '~' + (Math.round(f.ratio * 10) / 10) + '×' : 'about 2×') + ' the variance (Deming’s funnel).',
    '',
    'The band is an oracle you only get in a simulation. What transfers is the question every swing deserves: spike, or shift?'
  ].join('\n');
}

/* ---------- render ---------- */
function render(){
  const s = scenario(), C = themeColors();
  if(phase === 'done'){
    stage.innerHTML = renderCollapse(s, C, calls, {width: stage.clientWidth || 760});   // narrow/wide derived from width

    reveal.hidden = true; controls.hidden = true; endcard.hidden = false;
    lessonsEl.innerHTML = lessonsLine();
    return;
  }
  stage.innerHTML = renderGrid(s, C, {turn, calls, cols, width: stage.clientWidth || 760});
  endcard.hidden = true; controls.hidden = false;
  reveal.hidden = phase !== 'reveal';
  hint.hidden = phase === 'reveal';
  nextBtn.textContent = phase === 'reveal' ? 'Go to quarter ' + (turn + 2) + ' →'
    : turn >= s.quarters - 1 ? 'See the verdict →' : 'Next quarter →';
}

/* ---------- exports + replay + theme ---------- */
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copymd: $('copymd')},
  getSvg: () => phase === 'done' ? renderCollapse(scenario(), themeColors(), calls, {width: 1088}) : null,
  getMarkdown: markdown,
  slug: () => slugify('signal-vs-noise-' + seed, 'signal-vs-noise')
});
$('again').addEventListener('click', () => startPlay((Math.random() * 2 ** 32) >>> 0));
// 'change' (release), not 'input': restarting mid-drag would hide the endcard + this
// very slider out from under the pointer, so a sweep never lands (audit 2026-07-16).
$('noise').addEventListener('change', e => { params = {...params, noiseSd: +e.target.value}; startPlay(); });

onThemeChange(render);
// re-render on a column-bucket flip OR a >8px width change (debounced): the grid
// cards and the collapse chart now scale with the measured width, not just cols.
let lastW = stage.clientWidth;
const onResize = debounced(() => {
  const next = colsFor(stage.clientWidth), w = stage.clientWidth;
  if(next !== cols || Math.abs(w - lastW) > 8){ cols = next; lastW = w; render(); }
}, 100);
new ResizeObserver(onResize).observe(stage);

loadHash();
if(params.noiseSd) $('noise').value = params.noiseSd;
cols = colsFor(stage.clientWidth || 760);
render();
