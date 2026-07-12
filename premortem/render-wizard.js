/* Per-phase HTML for the premortem wizard. Every user string through esc().
   The interactive hooks (data-* attributes) are the contract app.js binds to. */
import {esc} from '../assets/svg.js';
import {exposure, isRisk} from './register.js';
import {votePool} from './wizard.js';
import {renderRegister} from './render-register.js';

const scoreable = e => Array.isArray(e.p) && Array.isArray(e.impact);
const risksOf = doc => (doc.entries || []).filter(isRisk);   // the wizard works the risks; facts/assumptions/beliefs live on the board
const TAGS = ['tiger', 'paper-tiger', 'elephant'];

export function renderPhase(doc, now = new Date()){
  switch(doc.phase){
    case 'FRAME': return frame(doc);
    case 'WRITE': return write(doc);
    case 'COLLECT': return collect(doc);
    case 'CLUSTER': return cluster(doc);
    case 'SCORE': return score(doc);
    case 'ACTIONS': return actions(doc);
    case 'VOTE': return vote(doc);
    case 'REGISTER': return renderRegister(doc, exposure(risksOf(doc)), now);
    default: return '';
  }
}

function frame(doc){
  return '<div class="phase" data-phase="FRAME"><h2>Frame the failure</h2>' +
    '<p class="phint">It\'s a few months from now and this shipped badly. Name it, and the question you\'ll put to the room.</p>' +
    '<label class="fl">The effort<input type="text" data-field="title" value="' + esc(doc.title || '') + '" placeholder="Habitat 2.0 launch"></label>' +
    '<label class="fl">The premortem question<input type="text" data-field="question" value="' + esc(doc.question || '') + '" placeholder="It\'s launch + 90 days and we failed. Why?"></label></div>';
}
function write(doc){
  return '<div class="phase" data-phase="WRITE"><h2>Silent writing</h2>' +
    '<p class="countdown" data-ends="' + (doc.endsAt || 0) + '">—</p>' +
    '<p class="phint">Everyone writes their own failure modes, silently, no discussion — that\'s how you dodge the first-speaker anchor. Add them on the next step, one per line.</p>' +
    '<button class="btn" data-act="skiptimer">Skip the timer</button></div>';
}
function collect(doc){
  const list = risksOf(doc).map(e =>
    '<li class="centry" data-id="' + e.id + '"><span class="ctext">' + esc(e.text) + '</span>' +
    '<span class="lexicon">' + TAGS.map(t => '<button class="lexbtn' + (e.tag === t ? ' on' : '') +
      '" data-tag="' + t + '" data-id="' + e.id + '">' + t.replace('-', ' ') + '</button>').join('') + '</span>' +
    '<button class="cdel" data-del="' + e.id + '" aria-label="Delete this risk">×</button></li>').join('');
  return '<div class="phase" data-phase="COLLECT"><h2>Collect the failure modes</h2>' +
    '<input type="text" data-add="entry" placeholder="A way it could fail — press Enter" aria-label="Add a risk">' +
    '<ul class="clist">' + list + '</ul>' +
    '<p class="phint">Tag the big ones: <b>tiger</b> (real and urgent), <b>paper tiger</b> (loud but toothless), <b>elephant</b> (everyone sees it, nobody says it).</p></div>';
}
function cluster(doc){
  const es = risksOf(doc);
  const clusters = [...new Set(es.map(e => e.cluster).filter(Boolean))];
  const rows = es.map(e =>
    '<li class="clrow" data-id="' + e.id + '"><span class="ctext">' + esc(e.text) + '</span>' +
    '<select data-cluster="' + e.id + '" aria-label="Cluster for: ' + esc(e.text) + '"><option value="">— cluster —</option>' +
    clusters.map(c => '<option' + (e.cluster === c ? ' selected=""' : '') + '>' + esc(c) + '</option>').join('') +
    '<option value="__new">new…</option></select>' +
    '<select data-merge="' + e.id + '" aria-label="Merge into"><option value="">merge into…</option>' +
    es.filter(o => o.id !== e.id).map(o => '<option value="' + o.id + '">' + esc(o.text.slice(0, 32)) + '</option>').join('') +
    '</select></li>').join('');
  return '<div class="phase" data-phase="CLUSTER"><h2>Cluster the duplicates</h2><ul class="cllist">' + rows + '</ul>' +
    '<p class="phint">Group the same fear said different ways; merge exact duplicates so you don\'t double-count.</p></div>';
}
function score(doc){
  const rows = risksOf(doc).map(e =>
    '<div class="scrow" data-id="' + e.id + '"><span class="ctext">' + esc(e.text) + '</span>' +
    '<span class="scin"><label>likelihood</label>' +
    '<input type="number" min="0" max="100" data-p="lo" data-id="' + e.id + '" value="' + (e.p ? e.p[0] : '') + '">–' +
    '<input type="number" min="0" max="100" data-p="hi" data-id="' + e.id + '" value="' + (e.p ? e.p[1] : '') + '">%</span>' +
    '<span class="scin"><label>impact</label>' +
    '<input type="number" min="0" data-impact="lo" data-id="' + e.id + '" value="' + (e.impact ? e.impact[0] : '') + '">–' +
    '<input type="number" min="0" data-impact="hi" data-id="' + e.id + '" value="' + (e.impact ? e.impact[1] : '') + '"></span></div>').join('');
  return '<div class="phase" data-phase="SCORE"><h2>Score the ranges</h2>' +
    '<label class="fl inlinelabel">Impact unit <input type="text" data-field="unit" value="' + esc(doc.unit || '£k') + '"></label>' +
    '<p class="phint">Give a 90% range, not a point — agree the range, then argue the actions. Likelihood and impact both as low–high.</p>' +
    rows + '</div>';
}
function actions(doc){
  const rows = (doc.entries || []).filter(scoreable).map(e =>
    '<div class="acrow" data-id="' + e.id + '"><p class="acrisk">' + esc(e.text) + '</p>' +
    e.actions.map((a, ai) => '<div class="acitem">' +
      '<input type="text" data-action="text" data-id="' + e.id + '" data-ai="' + ai + '" value="' + esc(a.text || '') + '" placeholder="mitigation" aria-label="Action">' +
      '<input type="text" data-action="owner" data-id="' + e.id + '" data-ai="' + ai + '" value="' + esc(a.owner || '') + '" placeholder="owner" aria-label="Owner">' +
      '<button class="acdel" data-actdel="' + e.id + '" data-ai="' + ai + '" aria-label="Remove action">×</button></div>').join('') +
    '<button class="btn acadd" data-actadd="' + e.id + '">＋ Add action</button></div>').join('');
  return '<div class="phase" data-phase="ACTIONS"><h2>What will we do about it?</h2>' + (rows ||
    '<p class="phint">No scored risks yet — go back and score at least one.</p>') +
    (rows ? '<p class="phint">One owner per action, or it belongs to no one.</p>' : '') + '</div>';
}
function vote(doc){
  const pool = votePool(doc), people = doc.people || 5;
  const rs = risksOf(doc);
  const used = rs.reduce((s, e) => s + e.actions.reduce((t, a) => t + (a.votes || 0), 0), 0);
  const acts = rs.flatMap(e => e.actions.map((a, ai) => ({...a, eid: e.id, ai})))
    .sort((x, y) => (y.votes || 0) - (x.votes || 0));
  const rows = acts.map((a, rank) =>
    '<div class="vrow' + (rank < 5 && a.votes ? ' topvote' : '') + '"><span class="vtext">' + esc(a.text || '(unnamed action)') + '</span>' +
    '<button class="vstep" data-vote="-1" data-id="' + a.eid + '" data-ai="' + a.ai + '" aria-label="Fewer dots">−</button>' +
    '<span class="vcount">' + (a.votes || 0) + '</span>' +
    '<button class="vstep" data-vote="1" data-id="' + a.eid + '" data-ai="' + a.ai + '" aria-label="More dots">+</button></div>').join('');
  return '<div class="phase" data-phase="VOTE"><h2>Dot-vote the actions</h2>' +
    '<label class="fl inlinelabel">People in the room <input type="number" min="1" max="30" data-field="people" value="' + people + '"></label>' +
    '<p class="phint">Pool: <b>' + pool + '</b> dots (' + people + ' × 3) · <b>' + (pool - used) + '</b> left. Spend them on the actions worth doing first.</p>' +
    (rows || '<p class="phint">No actions to vote on — add some on the previous step.</p>') + '</div>';
}
