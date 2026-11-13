import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {learningAgendaProjection} from '../learning-agenda.js';
import {overviewProjection} from '../overview.js';
import {treeProjection} from '../tree.js';
import {treeLayout} from '../layout-tree.js';
import {renderLearningAgenda, renderLearningAgendaReceipt} from '../render-learning-agenda.js';
import {renderLearningCloseOut} from '../render-learning-closeout.js';
import {renderOverview} from '../render-overview.js';
import {renderTree, connectorSegments} from '../render-tree.js';

/* a real face is wider the larger it is set: seven pixels a character at 12px, scaled by the size in the font */
const measure = (text, font) => String(text).length * 7 * ((/(\d+(?:\.\d+)?)px/.exec(font || '') || [0, 12])[1] / 12);
const colors = {bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A'};
const NATIVE = {colors, measure, intent:'native'};

/* the ink extent of every <text>: its anchor and its measured width at its own size */
function inkExtents(svg){
  return [...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"([^>]*)>([\s\S]*?)<\/text>/g)].map(m => {
    const size = +(m[3].match(/font-size="([\d.]+)"/) || [0, 12])[1];
    const text = m[4].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    const w = measure(text, size + 'px x');
    const anchor = (m[3].match(/text-anchor="(\w+)"/) || [0, 'start'])[1];
    const x = +m[1], left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return {text, left, right: left + w};
  });
}
const viewWidth = svg => +svg.match(/viewBox="0 0 ([\d.]+) /)[1];

const decision = (name, fields = '') => `decision ${name}:
  question: Will ${name} clear the threshold, given everything that has to be true first?
  signal: ${name} acceptance
  reading: ${name} reading
  learn: Get ${name} acceptance from ${name} owner by 2026-08-20.
  enough: Yes above the ${name} threshold; no below it
  owner: ${name} owner
  answer-by: 2026-08-20${fields}
`;
const LONG = 'title: A deliberately long plan title that must wrap inside the picture rather than run off its right edge\ndate: 2026-08-13\nstyle: agenda\n' +
  decision('pricing') + decision('groups', '\n  when: pricing') + 'NOW\n  Core: Shared foundation\n  Growth: Revenue offer with a very long work title that goes on and on [if pricing]\n';
function agenda(doc = LONG){
  const model = parse(doc), projected = project(model, '2026-08-13');
  return learningAgendaProjection(model, projected);
}

/* XP-3 */
test('the agenda title wraps inside the canvas and every line of the picture stays inside it', () => {
  const svg = renderLearningAgenda(agenda(), {...NATIVE, width:1160, selectedKey:'pricing'});
  const W = viewWidth(svg);
  for(const t of inkExtents(svg)){
    assert.ok(t.left >= -0.5 && t.right <= W + 0.5, `"${t.text.slice(0, 50)}" runs ${t.left.toFixed(0)}..${t.right.toFixed(0)} of ${W}`);
  }
});

test('the decision receipt wraps its heading and its long labels, and draws nothing twice', () => {
  const svg = renderLearningAgendaReceipt(agenda(), {...NATIVE, width:760, selectedKey:'groups'});
  const W = viewWidth(svg);
  for(const t of inkExtents(svg)) assert.ok(t.left >= -0.5 && t.right <= W + 0.5, `"${t.text.slice(0, 50)}" runs ${t.left.toFixed(0)}..${t.right.toFixed(0)} of ${W}`);
  const positioned = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)</g)].map(m => m[1] + '|' + m[2] + '|' + m[3]);
  assert.equal(new Set(positioned).size, positioned.length, 'no text is drawn twice at the same place');
});

/* XP-1, XP-11 */
test('the agenda, the receipt and the close-out each name a face on the picture itself', () => {
  const a = agenda();
  for(const svg of [renderLearningAgenda(a, {...NATIVE, width:1160}),
    renderLearningAgendaReceipt(a, {...NATIVE, width:760, selectedKey:'pricing'}),
    renderLearningCloseOut({}, {key:'pricing', name:'pricing', question:'Q?', answer:{direction:'yes'}}, {basisKind:'observation', carryForward:'scoped-finding'}, NATIVE)])
    assert.match(svg, /^<svg[^>]* font-family="'DM Sans',sans-serif"/, svg.slice(0, 120));
});

/* XP-2 */
test('the agenda export shows the dossier the view shows for the selected decision', () => {
  const svg = renderLearningAgenda(agenda(), {...NATIVE, width:1160, selectedKey:'pricing'});
  assert.match(svg, /data-kind="agenda-dossier"/);
  assert.match(svg, /FOCUS DOSSIER/);
});

/* XP-5 */
test('the selected-decision panel is headed with the question, never the key', () => {
  const model = parse('decision pricing:\n  question: Which price do we launch at?\n  signal: s\n  reading: r\n  owner: o\n  answer-by: 2026-08-10\nNOW\n  Core: Shared\n');
  const overview = overviewProjection(project(model, '2026-08-11'));
  const svg = renderOverview(overview, {...NATIVE, width:1160, selectedKey:'pricing'});
  const panel = svg.match(/<g data-kind="overview-receipt"[\s\S]*?<\/g>/)?.[0] || '';
  assert.match(panel, /Which price do we launch at\?/);
  assert.doesNotMatch(panel, />Pricing</);
});

/* XP-6 */
test('the roadmap grid takes the full content width under the header', () => {
  const model = parse('NOW\n  Core: One\nNEXT\n  Core: Two\n');
  const svg = renderOverview(overviewProjection(project(model, '2026-08-11')), {...NATIVE, width:1845});
  const grid = svg.match(/<g data-kind="roadmap-grid"><rect x="(\d+)" y="[\d.]+" width="([\d.]+)"/);
  assert.ok(grid, 'a grid is drawn');
  assert.ok(Math.abs((+grid[1] + +grid[2]) - (viewWidth(svg) - +grid[1])) <= 2, `grid ${grid[1]}..${+grid[1] + +grid[2]} of ${viewWidth(svg)}`);
});

/* XP-4 */
test('a branch connector runs in the gaps and stops at the nearest card; it never crosses a card', () => {
  const entry = {diamond:{y:300, h:112}, arms:{yes:[{y:200, h:40}, {y:140, h:40}, {y:80, h:50}], no:[]}, stump:null};
  const segs = connectorSegments(entry, {side:'yes'});
  assert.deepEqual(segs, [[240, 300], [180, 200], [130, 140]]);
  for(const [a, b] of segs) for(const box of entry.arms.yes) assert.ok(b <= box.y || a >= box.y + box.h, 'a segment crosses a card');
  const down = connectorSegments({diamond:{y:300, h:112}, arms:{yes:[], no:[{y:460, h:40}, {y:512, h:30}]}}, {side:'no'});
  assert.deepEqual(down, [[412, 460], [500, 512]]);
});

/* XP-9 */
test('a tree card that cuts a long item title keeps the whole text in the SVG, and cuts at a word', () => {
  const title = 'Platform engineering and performance work across every region and every environment we operate today';
  const doc = `today: 2026-12-01\ndecision pricing:\n  question: Which price?\n  signal: s\n  reading: r\n  owner: o\n  answer-by: 2026-12-20\nNOW\n  Core: ${title} [if pricing]\n`;
  const projection = project(parse(doc), '2026-12-01');
  const tp = treeProjection(projection);
  const svg = renderTree(tp, treeLayout(tp, {width:1160, measure}), {...NATIVE, today:'2026-12-01', projection});
  assert.ok(svg.includes('<title>' + title + '</title>'), 'the whole title is in the SVG');
  const cut = [...svg.matchAll(/>([^<>]*…)</g)].map(m => m[1]);
  for(const c of cut){ const stem = c.replace(/…$/, ''); if(title.startsWith(stem.slice(0, 20))) assert.ok(title.startsWith(stem) && /\s/.test(title[stem.length] || ' '), 'cut mid-word: ' + c); }
});
