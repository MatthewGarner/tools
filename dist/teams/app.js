import { mountShell } from '../shared/shell.js?v=0.20.0';
import { attachCardDrag } from '../shared/drag.js?v=0.20.0';
import { escapeHtml, downloadText, readStore, writeStore } from '../shared/utils.js?v=0.20.0';
import { CAPABILITIES, DEFAULT_ASSUMPTIONS, DEFAULT_LAYOUT, FLOWS, HORIZON, SCENARIOS, TEAM_IDS, TEAM_NAMES, TICK, normalizeAssumptions, normalizeLayout, routeFor, simulate } from './engine.js?v=0.20.0';

import {workloadFromPreset,validateWorkload} from './workload.js?v=0.20.0';
import {workloadEditor} from './workload-ui.js?v=0.20.0';
import {ARRANGEMENTS,extensions,activeWorkload,validateDesign,validatePortable,portable,workloadSummary} from './library.js?v=0.20.0';

mountShell({ active: 'teams', label: 'MODEL 02', title: 'How teams fit the work' });
const $ = selector => document.querySelector(selector);
const KEY = 'thinking-lab:teams:v1';
const palette = { a: { color: 'var(--accent)', wash: 'var(--card)', line: 'var(--accent-soft)' }, b: { color: 'var(--muted)', wash: 'var(--card)', line: 'var(--surface)' }, c: { color: 'var(--warn)', wash: 'var(--card)', line: 'var(--warn-soft)' } };
const capById = Object.fromEntries(CAPABILITIES.map(cap => [cap.id, cap]));
const names = raw => Object.fromEntries(TEAM_IDS.map(id => [id, typeof raw?.[id] === 'string' && raw[id].trim() ? raw[id].trim().slice(0, 28) : TEAM_NAMES[id]]));
function normalizeSession(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const extra=extensions(raw);
  return { ...extra, layout: normalizeLayout(raw.layout), names: names(raw.names), scenario: (Object.hasOwn(SCENARIOS, raw.scenario)||extra.workloads.some(w=>w.id===raw.scenario)) ? raw.scenario : 'rush', assumptions: normalizeAssumptions(raw.assumptions), day: Number.isFinite(raw.day) ? Math.round(Math.max(0, Math.min(HORIZON, raw.day)) / TICK) * TICK : 10, trace: typeof raw.trace === 'string' ? raw.trace : null, baseline: raw.baseline && typeof raw.baseline === 'object' ? { layout: normalizeLayout(raw.baseline.layout), names: names(raw.baseline.names) } : null };
}
const loaded = readStore(KEY, {}) || {};
let session,loadError='';
try{session=normalizeSession(loaded);}catch(error){writeStore(KEY+':recovery',loaded);session=normalizeSession({});loadError='Saved data could not be read. Its original record was retained for recovery. '+error.message;}
let undoStack = Array.isArray(loaded.undo) ? loaded.undo.slice(-20).flatMap(x=>{try{return[normalizeSession(x)];}catch{return[];}}) : [];
let result;
let baseline;
let designResults=[];
const workloadName=()=>SCENARIOS[session.scenario]?.name||session.workloads.find(w=>w.id===session.scenario).name;
const workloadConfig=()=>typeof activeWorkload(session)==='string'?workloadFromPreset(session.scenario):activeWorkload(session);
let playing = false;
let timer;
let overlayFrame;
const number = (value, digits = 1) => Number(value).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const dayText = day => Number.isInteger(day) ? String(day) : number(day, 2);
const frame = () => result.history[Math.round(session.day / TICK)];
const traceJob = () => frame().jobs.find(job => job.id === session.trace);
const sourceJob = () => result.workload.find(job => job.id === session.trace);
function save() {
  if (!writeStore(KEY, { ...session, undo: undoStack })) status('Browser storage is unavailable. Export to keep this arrangement.');
}
function status(text) { $('#status').textContent = text; }
function compute() {
  result = simulate({ layout: session.layout, scenario: activeWorkload(session), assumptions: session.assumptions });
  baseline = session.baseline ? simulate({ layout: session.baseline.layout, scenario: activeWorkload(session), assumptions: session.assumptions }) : null;
  designResults=session.designs.map(d=>({...d,result:simulate({layout:d.layout,scenario:activeWorkload(session),assumptions:session.assumptions})}));
  if (!result.workload.some(job => job.id === session.trace)) session.trace = frame().jobs.find(job => job.arrival <= session.day && job.completedAt === null)?.id || result.workload[0].id;
}
function pause() { playing = false; clearTimeout(timer); renderPlayback(); }
function mutate(change, text) {
  pause();
  const activeId = document.activeElement?.id;
  undoStack.push(structuredClone(session));
  undoStack = undoStack.slice(-20);
  change(); compute(); renderAll(); save(); status(text);
  if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
}
function moveCapability(capability, team) {
  if (!capById[capability] || !TEAM_IDS.includes(team) || session.layout[capability] === team) return;
  mutate(() => { session.layout[capability] = team; }, `${capById[capability].name} moved to ${session.names[team]}. The same workload has been replayed; you are still at day ${dayText(session.day)}.`);
}
function renderMap() {
  $('#team-columns').innerHTML = TEAM_IDS.map(id => {
    const cards = CAPABILITIES.filter(cap => session.layout[cap.id] === id);
    const capacity = cards.reduce((total, cap) => total + result.capacities[cap.id], 0);
    const colors = palette[id];
    return `<section class="team-column" data-drop-id="${id}" aria-label="${escapeHtml(session.names[id])} team" style="--team-color:${colors.color};--team-wash:${colors.wash};--team-line:${colors.line}"><div class="team-head"><span class="team-mark" aria-hidden="true"></span><label class="sr-only" for="team-name-${id}">Name for team ${id.toUpperCase()}</label><input class="team-name" id="team-name-${id}" data-team-name="${id}" maxlength="28" value="${escapeHtml(session.names[id])}" spellcheck="false"></div><p class="team-stats">${cards.length} capabilities · ${number(capacity, 2)} effort / day</p><div class="capability-list">${cards.length ? cards.map(cap => `<article class="capability-card" data-drag-id="${cap.id}" id="card-${cap.id}"><div class="capability-top"><button id="handle-${cap.id}" class="drag-handle" type="button" data-drag-handle aria-label="Drag ${cap.name}; alternatively use Move to below" title="Drag ${cap.name}">⠿</button><strong>${cap.name}</strong><span class="queue-pill" id="queue-${cap.id}">0 ready</span></div><div class="capability-meta"><span id="next-${cap.id}">${cap.description}</span><span>${number(result.capacities[cap.id], 2)} effort / day</span></div><div class="card-work" aria-hidden="true"><span id="progress-${cap.id}"></span></div><div class="card-move"><label for="move-${cap.id}">Move to</label><select id="move-${cap.id}" data-move-capability="${cap.id}" aria-label="Move ${cap.name} to team">${TEAM_IDS.map(team => `<option value="${team}" ${team === id ? 'selected' : ''}>${escapeHtml(session.names[team])}</option>`).join('')}</select></div></article>`).join('') : '<div class="empty-team">Drop a capability here.<br>This team has no specialists yet.</div>'}</div></section>`;
  }).join('');
}
function renderPlayback() {
  $('#play-label').textContent = playing ? 'Pause' : session.day >= HORIZON ? 'Replay work' : 'Play work';
  $('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('#step').disabled = session.day >= HORIZON;
  $('#day').value = session.day;
  $('#day-value').value = dayText(session.day);
  $('#playback-state').textContent = playing ? 'Running' : session.day >= HORIZON ? 'Complete' : 'Paused';
  $('#playback-state').classList.toggle('running', playing);
}
function renderFrame() {
  const now = frame();
  const selected = traceJob();
  const source = sourceJob();
  const route = routeFor(source.stages, session.layout);
  const routeCaps = new Set(route.map(stage => stage.capability));
  for (const cap of CAPABILITIES) {
    const queue = now.queues[cap.id];
    const next = now.jobs.find(job => job.id === queue[0]);
    const pill = $(`#queue-${cap.id}`);
    pill.textContent = `${queue.length} ready`;
    pill.classList.toggle('busy', queue.length > 1);
    $(`#next-${cap.id}`).textContent = next ? `Next: ${next.label}` : 'No work waiting';
    const sourceNext = next && result.workload.find(job => job.id === next.id);
    const transferEffort = next?.stageIndex > 0 && session.layout[sourceNext.stages[next.stageIndex - 1].capability] !== session.layout[cap.id] ? session.assumptions.handoffEffort : 0;
    const stageEffort = next ? sourceNext.stages[next.stageIndex].effort + transferEffort : 1;
    $(`#progress-${cap.id}`).style.width = `${next ? Math.max(3, 100 * (1 - next.remaining / stageEffort)) : 0}%`;
    $(`#card-${cap.id}`).classList.toggle('on-route', routeCaps.has(cap.id));
    $(`#card-${cap.id}`).classList.toggle('route-current', selected.arrival <= session.day && selected.completedAt === null && source.stages[selected.stageIndex].capability === cap.id);
  }
  renderPlayback(); renderTrace(); renderChart();
  const busiest = CAPABILITIES.reduce((best, cap) => now.queues[cap.id].length > now.queues[best.id].length ? cap : best, CAPABILITIES[0]);
  const count = now.queues[busiest.id].length;
  $('#bottleneck').innerHTML = count ? `At day ${dayText(session.day)}, <strong>${busiest.name} has ${count} ${count === 1 ? 'piece' : 'pieces'} of work ready</strong> and ${number(result.capacities[busiest.id], 2)} effort points per day. ${now.completed} pieces have finished so far.` : `At day ${dayText(session.day)}, no work is waiting at a capability. <strong>${now.completed} pieces have finished</strong>; ${now.jobs.filter(job => job.arrival <= session.day && job.completedAt === null && job.readyAt > session.day).length} are crossing a boundary.`;
  cancelAnimationFrame(overlayFrame); overlayFrame = requestAnimationFrame(drawRouteOverlay);
}
function renderTrace() {
  const job = traceJob();
  const source = sourceJob();
  const route = routeFor(source.stages, session.layout);
  const state = job.completedAt !== null ? `Finished on day ${dayText(job.completedAt)}; ${dayText(job.completedAt - job.arrival)} days from arrival.` : job.arrival > session.day ? `Arrives on day ${dayText(job.arrival)}. Its route is shown below.` : job.readyAt > session.day ? `Crossing a boundary. Ready for ${capById[source.stages[job.stageIndex].capability].name} on day ${dayText(job.readyAt)}.` : `Ready at ${capById[source.stages[job.stageIndex].capability].name}. ${number(job.queueTime)} days spent waiting so far.`;
  $('#trace-status').textContent = state;
  $('#route-steps').innerHTML = route.map((stage, index) => {
    const completion = job.completions[index];
    const connector = index ? `<li class="route-connector${stage.crossing ? ' crossing' : ''}">${stage.crossing ? `Boundary · ${number(session.assumptions.handoffDelay, 2)} days + ${number(session.assumptions.handoffEffort, 2)} effort` : 'Same team · no transfer delay'}</li>` : '';
    return `${connector}<li class="route-step${completion ? ' done' : job.arrival <= session.day && job.stageIndex === index ? ' current' : ''}"><span class="cap-letter" aria-hidden="true">${completion ? '✓' : capById[stage.capability].short}</span><strong>${capById[stage.capability].name}</strong><span>${escapeHtml(session.names[stage.team])}${completion ? ` · day ${dayText(completion.end)}` : ''}</span></li>`;
  }).join('');
}
function drawRouteOverlay() {
  const map = $('#team-map');
  const bounds = map.getBoundingClientRect();
  const source = sourceJob();
  const job = traceJob();
  if (!source || !bounds.width) return;
  const route = routeFor(source.stages, session.layout);
  const overlay = $('#route-overlay');
  overlay.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  const edges = [];
  for (let index = 1; index < route.length; index++) {
    const from = $(`#card-${route[index - 1].capability}`).getBoundingClientRect();
    const to = $(`#card-${route[index].capability}`).getBoundingClientRect();
    const sameColumn = Math.abs(from.left - to.left) < 10;
    let path;
    if (sameColumn) {
      const down = to.top > from.top;
      const x = from.left + from.width * 0.7 - bounds.left;
      const startY = (down ? from.bottom : from.top) - bounds.top;
      const endY = (down ? to.top : to.bottom) - bounds.top;
      const side = Math.max(from.right, to.right) - bounds.left + 7;
      path = down && to.top - from.bottom < 30 ? `M${x},${startY} L${x},${endY}` : `M${x},${startY} C${side},${startY} ${side},${endY} ${x},${endY}`;
    } else {
      const right = to.left > from.left;
      const startX = (right ? from.right : from.left) - bounds.left;
      const endX = (right ? to.left : to.right) - bounds.left;
      const startY = from.top + from.height * 0.4 - bounds.top;
      const endY = to.top + to.height * 0.4 - bounds.top;
      const middle = (startX + endX) / 2;
      path = `M${startX},${startY} C${middle},${startY} ${middle},${endY} ${endX},${endY}`;
    }
    const completed = job.completions.length >= index;
    edges.push(`<path id="route-edge-${index}" d="${path}" fill="none" stroke="${route[index].crossing ? 'var(--warn)' : 'var(--muted)'}" stroke-width="2" ${route[index].crossing ? 'stroke-dasharray="5 4"' : ''} opacity="${completed ? '.85' : '.4'}"/>`);
  }
  overlay.innerHTML = edges.join('');
  if (job.completedAt === null && job.readyAt > session.day && job.arrival <= session.day && job.stageIndex > 0) {
    const transfer = job.transfers.at(-1);
    const path = $(`#route-edge-${job.stageIndex}`);
    if (transfer && path && transfer.end > transfer.start) {
      const fraction = Math.max(0, Math.min(1, (session.day - transfer.start) / (transfer.end - transfer.start)));
      const point = path.getPointAtLength(path.getTotalLength() * fraction);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y); dot.setAttribute('r', 5); dot.setAttribute('fill', 'var(--warn)'); dot.setAttribute('stroke', 'var(--card)'); dot.setAttribute('stroke-width', 2); overlay.append(dot);
    }
  }
}
function renderOutcomes() {
  const now = result.final;
  const base = baseline?.final;
  $('#metric-finished').innerHTML = `${now.completed}<em>/ ${result.workload.length}</em>`;
  $('#metric-lead').innerHTML = now.medianLeadTime === null ? '—' : `${number(now.medianLeadTime)}<em>days</em>`;
  $('#metric-handoffs').textContent = now.handoffs;
  $('#metric-open').textContent = now.unfinished;
  $('#comparison-label').textContent = base ? 'Compared with pinned baseline' : 'Current arrangement';
  const rows = [['finished', now.completed, base?.completed, true, 'pieces', 0], ['lead', now.medianLeadTime, base?.medianLeadTime, false, 'days', 1], ['handoffs', now.handoffs, base?.handoffs, false, 'handoffs', 0], ['open', now.unfinished, base?.unfinished, false, 'pieces', 0]];
  for (const [id, value, before, higher, unit, digits] of rows) {
    const element = $(`#delta-${id}`);
    element.className = '';
    if (!base) { element.textContent = id === 'finished' ? 'Pin a baseline to compare' : ''; continue; }
    if (value === null || before === null) { element.textContent = 'Not enough finished work'; continue; }
    const difference = value - before;
    element.textContent = Math.abs(difference) < 0.001 ? 'Same as baseline' : `${difference > 0 ? '+' : '−'}${number(Math.abs(difference), digits)} ${unit} vs baseline`;
    if (difference) element.className = (higher ? difference > 0 : difference < 0) ? 'improved' : 'worse';
  }
  $('#baseline-status').textContent = base ? 'Baseline pinned · same workload' : 'No baseline pinned';
  $('#pin').textContent = base ? 'Replace baseline' : 'Pin baseline';
  const currentCapacity = Object.values(result.capacities).reduce((sum, value) => sum + value, 0);
  const baseCapacity = baseline ? Object.values(baseline.capacities).reduce((sum, value) => sum + value, 0) : null;
  $('#comparison-detail').innerHTML = `${number(currentCapacity, 2)} of 6 effort points per day remain after internal coordination. ${number(now.queueTime)} work-days accumulate in queues.${base ? ` The baseline has ${number(baseCapacity, 2)} effort per day and ${number(base.queueTime)} work-days in queues.<br><button id="restore-baseline" class="button quiet" type="button">Use baseline layout ↶</button>` : ''}`;
  const tableRows = result.history.filter(row => Number.isInteger(row.day));
  $('#data-table').innerHTML = `<caption class="sr-only">Daily completed and unfinished work, with baseline comparison.</caption><thead><tr><th scope="col">Day</th><th scope="col">Finished</th><th scope="col">Unfinished</th><th scope="col">Handoffs</th>${base ? '<th scope="col">Baseline finished</th>' : ''}</tr></thead><tbody>${tableRows.map(row => `<tr><th scope="row">${row.day}</th><td>${row.completed}</td><td>${row.unfinished}</td><td>${row.handoffs}</td>${base ? `<td>${baseline.history[Math.round(row.day / TICK)].completed}</td>` : ''}</tr>`).join('')}</tbody>`;
}
function renderChart() {
  const container = $('#flow-chart');
  const width = Math.max(260, container.clientWidth - 18);
  const height = width < 450 ? 205 : 235;
  const margin = { left: 32, right: 15, top: 22, bottom: 28 };
  const x = day => margin.left + day / HORIZON * (width - margin.left - margin.right);
  const max = Math.ceil(result.workload.length / 5) * 5;
  const y = value => height - margin.bottom - value / max * (height - margin.top - margin.bottom);
  const path = rows => rows.map((row, index) => `${index ? 'L' : 'M'}${x(row.day).toFixed(2)},${y(row.completed).toFixed(2)}`).join(' ');
  let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
  for (let value = 0; value <= max; value += 5) svg += `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--line)"/><text x="${margin.left - 9}" y="${y(value) + 4}" text-anchor="end">${value}</text>`;
  for (const day of [0, 5, 10, 15, 20, 25, 30]) svg += `<text x="${x(day)}" y="${height - 8}" text-anchor="middle">${day === 0 ? 'D0' : day}</text>`;
  if (baseline) svg += `<path d="${path(baseline.history)}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(result.history)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><line x1="${x(session.day)}" x2="${x(session.day)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="var(--accent-line)"/><circle cx="${x(session.day)}" cy="${y(frame().completed)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/></svg>`;
  container.innerHTML = svg;
  container.setAttribute('aria-label', `Completed work over 30 days. Current layout finishes ${result.final.completed} of ${result.workload.length}.${baseline ? ` Baseline finishes ${baseline.final.completed}.` : ''} Replay cursor is at day ${dayText(session.day)}, with ${frame().completed} complete.`);
}
function renderAssumptionsDraft() {
  $('#coordination').value = session.assumptions.coordination * 100;
  $('#handoff-delay').value = session.assumptions.handoffDelay;
  $('#handoff-effort').value = session.assumptions.handoffEffort;
  updateAssumptionsOutputs();
}
function updateAssumptionsOutputs() {
  $('#handoff-effort-value').value = `${number(Number($('#handoff-effort').value),2)} effort`;
  $('#coordination-value').value = `${$('#coordination').value}%`;
  $('#handoff-delay-value').value = `${number(Number($('#handoff-delay').value), 2)} days`;
}
function renderAll() {
  $('#scenario').innerHTML=Object.entries(SCENARIOS).map(([id,s])=>`<option value="${id}">${escapeHtml(s.name)}</option>`).join('')+(session.workloads.length?`<optgroup label="Your workloads">${session.workloads.map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')}</optgroup>`:'');
  $('#scenario').value = session.scenario;
  $('#workload-description').textContent = SCENARIOS[session.scenario]?.description||`${workloadName()} · ${result.workload.length} pieces across ${number(workloadConfig().span)} arrival days. Same generated jobs for every arrangement.`;
  $('#undo').disabled = !undoStack.length;
  renderMap();
  $('#trace').innerHTML = result.workload.map(job => `<option value="${job.id}" ${job.id === session.trace ? 'selected' : ''}>${escapeHtml(job.label)} · arrives day ${dayText(job.arrival)}</option>`).join('');
  renderOutcomes(); renderFrame(); renderAssumptionsDraft(); renderLibrary();
}
function tick() {
  if (!playing) return;
  session.day = Math.min(HORIZON, session.day + TICK);
  renderFrame();
  if (session.day >= HORIZON) { pause(); save(); status(`Replay complete. ${result.final.completed} of ${result.workload.length} pieces of work finished. Move a capability or change the workload to try another arrangement.`); }
  else timer = setTimeout(tick, 190);
}
function togglePlay() {
  if (playing) { pause(); save(); return; }
  if (session.day >= HORIZON) session.day = 0;
  playing = true; renderFrame(); timer = setTimeout(tick, 250);
}
function exportExperiment() {
  const row = result.final;
  const md=text=>String(text).replaceAll('|','\\|').replaceAll('\n',' ');
  // Routes must come from the active definition, including custom stage order.
  const lines = ['# How teams fit the work', '', `Workload: ${workloadName()}. Seed ${workloadConfig().seed}; ${result.workload.length} jobs; 30-day horizon. Replay shown at day ${dayText(session.day)}.`, '', '## Arrangement', '', '| Capability | Current team | Capacity / day | Baseline team |', '| --- | --- | ---: | --- |', ...CAPABILITIES.map(cap => `| ${cap.name} | ${md(session.names[session.layout[cap.id]])} | ${number(result.capacities[cap.id], 2)} | ${session.baseline ? md(session.baseline.names[session.baseline.layout[cap.id]]) : '—'} |`), '', '## Shared assumptions', '', `Each specialist has 1 nominal effort point per day. Coordination costs ${number(session.assumptions.coordination * 100, 0)}% of that capacity for each teammate. Each boundary crossing adds ${number(session.assumptions.handoffDelay, 2)} days of delay and ${number(session.assumptions.handoffEffort, 2)} receiving effort. FIFO queues, quarter-day steps, no borrowing capacity between capabilities. All arrangements use the same jobs and assumptions.`, '', '## At day 30', '', '| Measure | Current | Baseline |', '| --- | ---: | ---: |', `| Finished | ${row.completed} | ${baseline ? baseline.final.completed : '—'} |`, `| Unfinished | ${row.unfinished} | ${baseline ? baseline.final.unfinished : '—'} |`, `| Median lead time, finished only | ${row.medianLeadTime === null ? '—' : number(row.medianLeadTime)} | ${baseline?.final.medianLeadTime == null ? '—' : number(baseline.final.medianLeadTime)} |`, `| Boundary handoffs | ${row.handoffs} | ${baseline ? baseline.final.handoffs : '—'} |`, `| Queue time, accumulated work-days | ${number(row.queueTime)} | ${baseline ? number(baseline.final.queueTime) : '—'} |`, '', '## Work routes', '', ...workloadConfig().flows.map(flow => `- ${md(flow.label)}: ${routeFor(flow.stages, session.layout).map(stage => `${capById[stage.capability].name} (${md(session.names[stage.team])})`).join(' → ')}`), '', '## Limits', '', 'A fictional mechanism model, not staffing advice. Fixed specialist capabilities, divisible effort, serial stages and FIFO work; no learning, shared skills, rework, priorities or hierarchy. A move replays an alternative history without a reorganisation cost. Coefficients are illustrative.', '', '## Work items', '', '| Work | Arrival | Finished | Queue days | Transfer days |', '| --- | ---: | ---: | ---: | ---: |', ...row.jobs.map(job => `| ${md(job.label)} | ${dayText(job.arrival)} | ${job.completedAt === null ? 'unfinished' : dayText(job.completedAt)} | ${number(job.queueTime)} | ${number(job.transferTime)} |`)];
  lines.push(...libraryMarkdown());
  downloadText(`teams-${session.scenario}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  status('Experiment exported as Markdown.');
}

function renderLibrary(){
  const entries=[{id:'current',title:'Current',layout:session.layout,names:session.names,result},...(baseline?[{id:'baseline',title:'Pinned baseline',layout:session.baseline.layout,names:session.baseline.names,result:baseline}]:[]),...designResults];
  $('#arrangement-count').textContent=`${session.designs.length} of 6 saved`;
  $('#arrangement-table').innerHTML=`<caption>Same ${escapeHtml(workloadName())} workload · 30 days</caption><thead><tr><th scope="col">Arrangement</th><th scope="col">Finished</th><th scope="col">Unfinished</th><th scope="col">Median days</th><th scope="col">Handoffs</th><th scope="col">Actions</th></tr></thead><tbody>${entries.map(e=>`<tr><th scope="row">${escapeHtml(e.title)}<details><summary>Membership</summary>${TEAM_IDS.map(id=>`<p>${escapeHtml(e.names[id])}: ${CAPABILITIES.filter(c=>e.layout[c.id]===id).map(c=>c.name).join(', ')||'empty'}</p>`).join('')}</details></th><td>${e.result.final.completed}</td><td>${e.result.final.unfinished}</td><td>${e.result.final.medianLeadTime===null?'—':number(e.result.final.medianLeadTime)}</td><td>${e.result.final.handoffs}</td><td>${session.designs.some(d=>d.id===e.id)?`<button class="button quiet" id="load-${e.id}" data-load-design="${e.id}">Use</button><button class="button quiet" data-delete-design="${e.id}" aria-label="Remove ${escapeHtml(e.title)} saved arrangement">Remove</button>`:'—'}</td></tr>`).join('')}</tbody>`;
  const config=workloadConfig(),summary=workloadSummary(config,session.layout,result.capacities);
  $('#workload-effort').innerHTML=`<p>Requested effort by capability in this generated sample, before receiving handoff effort. Available effort is the full 30-day capacity in the current arrangement; arrivals, serial dependencies and queues can prevent its use.</p><div class="effort-rows">${summary.map(c=>`<div><span>${c.label}</span><strong>${number(c.effort)} requested / ${number(c.capacity)} available</strong><span class="effort-track" aria-hidden="true"><i style="width:${Math.min(100,c.effort/c.capacity*100)}%"></i></span></div>`).join('')}</div><p>Realised mix: ${config.flows.map(f=>`${escapeHtml(f.label)}: ${result.workload.filter(j=>j.type===f.id).length}`).join(' · ')}.</p>`;
}
function libraryMarkdown(){
  const clean=text=>String(text).replaceAll('|','\\|').replaceAll('\n',' '),config=workloadConfig();
  const lines=['','## Workload definition','',`${clean(config.name)}. ${config.count} jobs across ${config.span} arrival days, sample ${config.seed}. Relative mix weights; stage efforts vary ±10%.`,''];
  for(const f of config.flows)lines.push(`### ${clean(f.label)}`,`Mix weight ${f.share}; short label ${clean(f.short)}.`,f.stages.map((s,i)=>`${i+1}. ${capById[s.capability].name}: ${s.effort} nominal effort`).join('\n'),'');
  lines.push('## Saved arrangements under this workload','','All arrangements use the active workload and shared assumptions. Lead times describe finished jobs only.','','| Arrangement | Finished | Unfinished | Median days | Handoffs |','| --- | ---: | ---: | ---: | ---: |',...designResults.map(d=>`| ${clean(d.title)} | ${d.result.final.completed} | ${d.result.final.unfinished} | ${d.result.final.medianLeadTime===null?'—':number(d.result.final.medianLeadTime)} | ${d.result.final.handoffs} |`),'');
  for(const d of session.designs)lines.push(`### ${clean(d.title)}`,...TEAM_IDS.map(id=>`- ${clean(d.names[id])}: ${CAPABILITIES.filter(c=>d.layout[c.id]===id).map(c=>c.name).join(', ')||'empty'}`),'');
  lines.push('JSON export retains the other saved workload definitions as well as this active comparison.');return lines;
}
const editor=workloadEditor($('#workload-editor'),{onSave:workload=>{
  if(!session.workloads.some(w=>w.id===workload.id)&&session.workloads.length>=6)throw Error('Six workloads are saved. Edit or remove one before saving another.');
  mutate(()=>{session.workloads=[...session.workloads.filter(w=>w.id!==workload.id),validateWorkload(workload)];session.scenario=workload.id;session.trace=null;},'Workload saved. Every arrangement has been replayed against the same jobs.');
},onDelete:id=>mutate(()=>{session.workloads=session.workloads.filter(w=>w.id!==id);if(session.scenario===id)session.scenario='rush';session.trace=null;},'Saved workload removed. Undo restores it.')});
$('#edit-workload').addEventListener('click',()=>{pause();editor.open(workloadConfig(),session.workloads.some(w=>w.id===session.scenario));});
$('#layout-preset').innerHTML='<option value="">Try an arrangement…</option>'+Object.entries(ARRANGEMENTS).map(([id,p])=>`<option value="${id}">${p.label}</option>`).join('');
$('#layout-preset').addEventListener('change',e=>{const p=ARRANGEMENTS[e.target.value];if(!p)return;mutate(()=>{session.layout={...p.layout};session.names={...p.names};},`${p.label} applied. Workload, saved alternatives and baseline remain. Undo restores your layout.`);e.target.value='';});
$('#save-arrangement-form').addEventListener('submit',e=>{e.preventDefault();try{if(session.designs.length>=6)throw Error('Six arrangements are saved. Remove one to save another.');const d=validateDesign({id:'arrangement-'+crypto.randomUUID(),title:$('#arrangement-title').value,layout:session.layout,names:session.names});mutate(()=>session.designs.push(d),'Arrangement saved. Change the work or move capabilities to compare.');$('#arrangement-title').value='';}catch(error){status(error.message);}});
$('#arrangement-table').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;const id=button.dataset.loadDesign||button.dataset.deleteDesign,design=session.designs.find(d=>d.id===id);if(!design)return;if(button.dataset.loadDesign)mutate(()=>{session.layout={...design.layout};session.names={...design.names};},'Saved arrangement copied to the canvas. Its saved version stays intact.');else{mutate(()=>{session.designs=session.designs.filter(d=>d.id!==id);},'Saved arrangement removed. Undo restores it.');$('#arrangement-title').focus({preventScroll:true});}});
$('#export-json').addEventListener('click',()=>{downloadText('teams-experiment.json',JSON.stringify(portable(session),null,2),'application/json');status('Workloads, arrangements and the current experiment exported as JSON.');});
$('#import-json').addEventListener('click',()=>$('#json-file').click());
$('#json-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('Choose a Teams export smaller than 1 MB.');const next=validatePortable(JSON.parse(await file.text()));mutate(()=>{session=next;},'Experiment imported. Undo restores your previous experiment.');}catch(error){status('Import left your work unchanged. '+error.message);}finally{e.target.value='';}});

$('#team-map').addEventListener('change', event => {
  if (event.target.dataset.moveCapability) moveCapability(event.target.dataset.moveCapability, event.target.value);
  if (event.target.dataset.teamName) {
    const id = event.target.dataset.teamName;
    const value = event.target.value.trim().slice(0, 28) || TEAM_NAMES[id];
    if (value !== session.names[id]) mutate(() => { session.names[id] = value; }, `Team renamed ${value}. Its capabilities and work are unchanged.`);
  }
});
$('#team-map').addEventListener('focusin', event => { if (event.target.matches('select,input')) pause(); });
attachCardDrag({ root: $('#team-map'), onDrop: ({ itemId, dropId }) => { moveCapability(itemId, dropId); document.getElementById(`handle-${itemId}`)?.focus({ preventScroll: true }); } });
$('#scenario').addEventListener('change', event => mutate(() => { session.scenario = event.target.value; session.trace = null; }, 'Workload changed for every arrangement. Team membership is unchanged.'));
$('#pin').addEventListener('click', () => mutate(() => { session.baseline = { layout: { ...session.layout }, names: { ...session.names } }; }, 'Baseline pinned. Move a capability to compare layouts on the same work.'));
$('#reset').addEventListener('click', () => mutate(() => { session.layout = { ...DEFAULT_LAYOUT }; session.names = { ...TEAM_NAMES }; }, 'Original team layout restored. Workload, assumptions and pinned baseline are kept.'));
$('#undo').addEventListener('click', () => {
  if (!undoStack.length) return;
  pause(); session = normalizeSession(undoStack.pop()); compute(); renderAll(); save(); status('Last change undone.');
  if ($('#undo').disabled) $('#pin').focus({ preventScroll: true });
});
$('#comparison-detail').addEventListener('click', event => { if (event.target.closest('#restore-baseline') && session.baseline) mutate(() => { session.layout = { ...session.baseline.layout }; session.names = { ...session.baseline.names }; }, 'The pinned layout is now the current arrangement.'); });
$('#play').addEventListener('click', togglePlay);
$('#step').addEventListener('click', () => { pause(); session.day = Math.min(HORIZON, session.day + 1); renderFrame(); save(); });
$('#day').addEventListener('input', event => {
  // Pausing redraws the controlled slider, so preserve the user's new value first.
  const selectedDay = Number(event.target.value);
  pause(); session.day = selectedDay; renderFrame();
});
$('#day').addEventListener('change', save);
$('#trace').addEventListener('change', event => { session.trace = event.target.value; renderFrame(); save(); });
$('#assumptions-form').addEventListener('submit', event => { event.preventDefault(); const next = normalizeAssumptions({ ...session.assumptions, coordination: Number($('#coordination').value) / 100, handoffDelay: Number($('#handoff-delay').value), handoffEffort:Number($('#handoff-effort').value) }); mutate(() => { session.assumptions = next; }, 'Every arrangement replayed with the new assumptions. Workload and team memberships are unchanged.'); });
$('#coordination').addEventListener('input', updateAssumptionsOutputs);
$('#handoff-delay').addEventListener('input', updateAssumptionsOutputs);
$('#handoff-effort').addEventListener('input', updateAssumptionsOutputs);
$('#restore-assumptions').addEventListener('click', () => mutate(() => { session.assumptions = { ...DEFAULT_ASSUMPTIONS }; }, 'Illustrative assumptions restored for every arrangement.'));
$('#export').addEventListener('click', exportExperiment);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); save(); } });
let resizeFrame;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { renderChart(); drawRouteOverlay(); }); });

// The shared drag helper owns pointer capture and edge scrolling.
$('#team-map').addEventListener('pointerdown', event => { if (event.target.closest('[data-drag-handle]')) pause(); });

compute(); renderAll();
if(loadError)status(loadError);
