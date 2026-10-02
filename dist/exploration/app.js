import { mountShell } from '../shared/shell.js?v=0.20.0';
import { downloadText, readStore, writeStore } from '../shared/utils.js?v=0.20.0';
import { WEEKS, SCENARIOS, defaultPlan, normalizePlan, normalizeAssumptions, simulate } from './engine.js?v=0.20.0';
mountShell({ active: 'exploration', label: 'M03', title: 'Exploration versus delivery' });
const $ = selector => document.querySelector(selector);
const KEY = 'thinking-lab:exploration:v1';
const n = (value, digits = 1) => Number(value).toFixed(digits);
function normalize(raw = {}) { raw ||= {}; const scenario = Object.hasOwn(SCENARIOS, raw.scenario) ? raw.scenario : 'product'; return { scenario, plan: normalizePlan(raw.plan), baseline: Array.isArray(raw.baseline) ? normalizePlan(raw.baseline) : null, assumptions: normalizeAssumptions(raw.assumptions, SCENARIOS[scenario]), week: Math.max(1, Math.min(20, Math.round(raw.week || 6))) }; }
let session = normalize(readStore(KEY, {})), undo = [], result, baseline;
function remember() { undo.push(structuredClone(session)); undo = undo.slice(-30); $('#undo').disabled = false; }
function save() { if (!writeStore(KEY, session)) $('#status').textContent = 'Browser storage is unavailable. Export to keep this plan.'; }
function compute() { result = simulate(session); baseline = session.baseline ? simulate({ ...session, plan: session.baseline }) : null; }
function inputs() {
  $('#scenario').value = session.scenario; $('#week').value = session.week;
  $('#usefulness').value = session.assumptions.usefulness * 100; $('#delay').value = session.assumptions.delay; assumptionLabels();
  $('#allocation').innerHTML = session.plan.map((value, index) => `<div class="week-column" id="column-${index}"><label for="effort-${index}">W${index + 1}</label><div class="effort-bar" id="bar-${index}" style="--research:${value * 10}%"><input id="effort-${index}" data-week="${index}" type="range" min="0" max="10" step="1" value="${value}" aria-label="Research effort in week ${index + 1}; ten total points"></div><output id="effort-value-${index}" for="effort-${index}">${value}</output></div>`).join('');
}
function assumptionLabels() { $('#usefulness-value').value = `${$('#usefulness').value}%`; $('#delay-value').value = `${$('#delay').value} weeks`; }
function chart() {
  const width = Math.max(280, $('#chart').clientWidth), height = width < 430 ? 210 : 250, max = Math.ceil(Math.max(result.final.value, baseline?.final.value || 0, 10) / 20) * 20;
  const x = week => 34 + week / 20 * (width - 48), y = value => height - 28 - value / max * (height - 48);
  const path = rows => `M${x(0)},${y(0)} ` + rows.map(row => `L${x(row.week)},${y(row.value)}`).join(' ');
  let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
  for (let value = 0; value <= max; value += 20) svg += `<path d="M34 ${y(value)} H${width - 14}" stroke="var(--line)"/><text x="26" y="${y(value) + 4}" text-anchor="end">${value}</text>`;
  for (const week of [0, 5, 10, 15, 20]) svg += `<text x="${x(week)}" y="${height - 8}" text-anchor="middle">${week === 0 ? 'W0' : week}</text>`;
  if (session.scenario === 'change') svg += `<path d="M${x(11)} 20 V${height - 28}" stroke="var(--warn)" stroke-dasharray="3 4"/><text x="${x(11) + 5}" y="15">world changes</text>`;
  if (baseline) svg += `<path d="${path(baseline.history)}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(result.history)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><circle cx="${x(session.week)}" cy="${y(result.history[session.week - 1].value)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/></svg>`;
  $('#chart').innerHTML = svg; $('#chart').setAttribute('aria-label', `Useful output rises to ${n(result.final.value)} by week 20.${baseline ? ` Pinned baseline: ${n(baseline.final.value)}.` : ''}`);
}
function render() {
  $('#value').textContent = n(result.final.value); $('#shipped').textContent = n(result.final.shipped, 0); $('#research').textContent = session.plan.reduce((a, b) => a + b, 0); $('#mismatch').textContent = `${n(result.final.technicalError * 100)}%`;
  $('#pin').textContent = baseline ? 'Replace baseline' : 'Pin baseline'; $('#undo').disabled = !undo.length;
  const difference = baseline ? result.final.value - baseline.final.value : 0;
  $('#delta').textContent = baseline ? `${difference >= 0 ? '+' : '−'}${n(Math.abs(difference))} vs pinned baseline` : 'fit-adjusted points, illustrative';
  $('#comparison').textContent = baseline ? `This plan produces ${n(result.final.value)} useful points; the baseline produces ${n(baseline.final.value)}. Both face the same hidden world, signals and feedback delay. The dashed line is the baseline.` : 'Pin this plan, then move effort between weeks. The same environmental conditions and observation noise will be used for both plans.';
  $('#week-label').value = session.week;
  session.plan.forEach((value, index) => { $(`#bar-${index}`).style.setProperty('--research', `${value * 10}%`); $(`#effort-value-${index}`).value = value; $(`#column-${index}`).classList.toggle('current', index + 1 === session.week); });
  const row = result.history[session.week - 1];
  $('#knowledge').innerHTML = [['need', 'What users need'], ['technical', 'What works technically']].map(([key, label]) => `<div class="knowledge-row"><div><span>${label}</span><span>Estimate ${n(row.belief[key], 2)}</span></div><div class="belief-track"><i class="world-marker" style="left:${row.world[key] * 100}%" title="World ${n(row.world[key], 2)}"></i><i class="belief-marker" style="left:${row.belief[key] * 100}%" title="Team estimate ${n(row.belief[key], 2)}"></i></div></div>`).join('') + '<p class="belief-key">Solid fill: team estimate · marker: hidden world · both on a 0–1 scale</p>';
  $('#evidence').innerHTML = `<h3>Evidence used in week ${session.week}</h3>${row.evidence.length ? row.evidence.map(item => `<p>${item.source === 'research' ? `Research now: need signal ${n(item.need, 2)}, given ${n(item.needWeight * 100, 0)}% weight. No technical signal.` : `Delivery from week ${item.from}: need ${n(item.need, 2)} (${n(item.needWeight * 100, 0)}% weight), technical ${n(item.technical, 2)} (${n(item.technicalWeight * 100, 0)}% weight).`}</p>`).join('') : '<p>No new observations. The team keeps its previous estimates.</p>'}<p>${row.build} points built, ${row.research} spent researching; ${row.pending} delivery observations still in transit.</p>`;
  chart();
}
function change(fn, text) { remember(); fn(); compute(); inputs(); render(); save(); $('#status').textContent = text; }
$('#allocation').addEventListener('pointerdown', event => { if (event.target.matches('[data-week]')) remember(); });
$('#allocation').addEventListener('keydown', event => { if (event.target.matches('[data-week]') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) remember(); });
$('#allocation').addEventListener('input', event => { if (!event.target.matches('[data-week]')) return; const index = Number(event.target.dataset.week); session.plan[index] = Number(event.target.value); session.week = index + 1; $('#week').value = session.week; compute(); render(); });
$('#allocation').addEventListener('change', () => { save(); $('#status').textContent = 'Plan replayed. Research plus delivery still equals ten points in every week.'; });
$('#scenario').addEventListener('change', event => { const next = event.target.value; change(() => { session.scenario = next; session.assumptions = normalizeAssumptions({}, SCENARIOS[next]); }, 'Both plans now face the same new situation.'); });
$('#pin').addEventListener('click', () => change(() => { session.baseline = [...session.plan]; }, 'Baseline pinned. Your next allocation changes affect the current plan.'));
$('#reset').addEventListener('click', () => change(() => { session.plan = defaultPlan(); }, 'Two research points per week restored. Baseline and assumptions are kept.'));
$('#undo').addEventListener('click', () => { if (!undo.length) return; session = undo.pop(); compute(); inputs(); render(); save(); $('#status').textContent = 'Last change undone.'; if (!undo.length) $('#pin').focus({ preventScroll: true }); });
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => change(() => { session.plan = Array.from({ length: WEEKS }, (_, i) => button.dataset.preset === 'early' ? i < 5 ? 6 : 1 : button.dataset.preset === 'ship' ? 0 : 2); }, `${button.textContent} applied. Inspect what the team actually learns.`)));
$('#week').addEventListener('input', event => { session.week = Number(event.target.value); render(); }); $('#week').addEventListener('change', save);
for (const id of ['usefulness', 'delay']) $(`#${id}`).addEventListener('input', assumptionLabels);
$('#assumptions').addEventListener('submit', event => { event.preventDefault(); const next = { usefulness: Number($('#usefulness').value) / 100, delay: Number($('#delay').value) }; change(() => { session.assumptions = next; }, 'Both plans replayed from week 1 with the same assumptions.'); });
$('#export').addEventListener('click', () => { const lines = ['# Exploration versus delivery', '', `Situation: ${SCENARIOS[session.scenario].name}. Research usefulness ${n(session.assumptions.usefulness * 100, 0)}%; delivery feedback delay ${session.assumptions.delay} weeks.`, '', `Useful output: ${n(result.final.value)}${baseline ? `; baseline ${n(baseline.final.value)}` : ''}. Built effort: ${result.final.shipped}.`, '', '| Week | Research | Build | Useful this week | Cumulative useful | Baseline research |', '| ---: | ---: | ---: | ---: | ---: | ---: |', ...result.history.map(row => `| ${row.week} | ${row.research} | ${row.build} | ${n(row.useful)} | ${n(row.value)} | ${session.baseline?.[row.week - 1] ?? '—'} |`), '', 'Fictional mechanism model. Useful output is a fit score, not an empirical forecast. Research learns needs only; shipping gives delayed technical and weaker needs evidence. The hidden world is used for evaluation, never directly by the team.', '', '## Evidence inspected', '', ...result.history.map(row => `- Week ${row.week}: ${row.evidence.map(item => `${item.source} from week ${item.from}; need=${n(item.need, 2)}${item.technical === undefined ? '' : `, technical=${n(item.technical, 2)}`}`).join('; ') || 'no new evidence'}.`)]; downloadText('exploration-plan.md', lines.join('\n'), 'text/markdown;charset=utf-8'); });
window.addEventListener('resize', chart);
compute(); inputs(); render();
