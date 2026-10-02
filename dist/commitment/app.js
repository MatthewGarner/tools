import { mountShell } from '../shared/shell.js?v=0.4.0';
import { downloadText, escapeHtml, readStore, writeStore } from '../shared/utils.js';
import { BASE_CAPACITY, DEFAULT_ASSUMPTIONS, HORIZON, SCENARIOS, createState, normalizeAssumptions, normalizePolicy, policyAt, schedulePolicy, simulate } from './engine.js';

mountShell({ active: 'commitment', label: 'MODEL 01', title: 'The Commitment Spiral' });
const $ = selector => document.querySelector(selector);
const STORE_KEY = 'thinking-lab:commitment:v1';
const initial = { version: 1, scenario: 'rush', week: 6, events: [], baseline: null, chart: 'work', assumptions: DEFAULT_ASSUMPTIONS };
const saved = readStore(STORE_KEY, initial);
const validEvents = values => Array.isArray(values) ? values.filter(e => e && Number.isInteger(e.week) && e.week >= 1 && e.week <= HORIZON && e.policy).map(e => ({ week: e.week, policy: normalizePolicy(e.policy) })).sort((a, b) => a.week - b.week).slice(0, HORIZON) : [];
let session = {
  ...initial,
  scenario: Object.hasOwn(SCENARIOS, saved?.scenario) ? saved.scenario : initial.scenario,
  week: Number.isInteger(saved?.week) ? Math.max(0, Math.min(HORIZON, saved.week)) : initial.week,
  events: validEvents(saved?.events),
  baseline: saved?.baseline && Number.isInteger(saved.baseline.week) && saved.baseline.week >= 0 && saved.baseline.week <= HORIZON ? { week: saved.baseline.week, events: validEvents(saved.baseline.events) } : null,
  chart: ['work', 'output', 'capacity'].includes(saved?.chart) ? saved.chart : 'work',
  assumptions: normalizeAssumptions(saved?.assumptions),
};
let current;
let forecast;
let reference;
let running = false;
let timer;
let lastStorageSuccess = true;
const number = (value, digits = 1) => (Math.abs(value) < 0.05 ? 0 : value).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = value => `${Math.round(value * 100)}%`;
const scenario = () => SCENARIOS[session.scenario];
const livePolicy = () => policyAt(scenario(), session.events, Math.max(1, session.week));
const draftPolicy = () => Object.fromEntries(['commitment', 'quality', 'recovery'].map(key => [key, Number($(`#${key}`).value)]));
function save() {
  lastStorageSuccess = writeStore(STORE_KEY, session);
  if (!lastStorageSuccess) message('Browser storage is unavailable. Export to keep this experiment.', true);
}
function message(text, warning = false) {
  $('#form-message').textContent = text;
  $('#form-message').classList.toggle('storage-warning', warning);
}
function announce(text) { $('#announcement').textContent = text; }
function setDraft(policy = livePolicy()) {
  for (const [key, value] of Object.entries(policy)) {
    $(`#${key}`).value = value;
    $(`#${key}-value`).value = `${value}%`;
  }
  $('#apply-week').value = Math.min(HORIZON, session.week + 1);
  updateTiming();
}
function updateDraft() {
  const policy = draftPolicy();
  for (const [key, value] of Object.entries(policy)) $(`#${key}-value`).value = `${value}%`;
  const same = Object.keys(policy).every(key => policy[key] === livePolicy()[key]);
  $('#policy-draft').textContent = same ? 'Current' : 'Draft';
}
function updateTiming() {
  const week = Number($('#apply-week').value);
  $('#timing-hint').textContent = week === session.week + 1 ? 'Next week' : week <= session.week ? 'Choose a future week' : `In ${week - session.week} weeks`;
}
function compute() {
  // Assumptions describe a shared world, not a dated policy intervention: always
  // replay both histories from the beginning so a pinned baseline stays comparable.
  current = simulate(scenario(), session.events, session.week, session.assumptions);
  forecast = simulate(scenario(), session.events, HORIZON, session.assumptions);
  reference = session.baseline ? simulate(scenario(), session.baseline.events, HORIZON, session.assumptions) : null;
}
function pause() { running = false; clearTimeout(timer); renderTransport(); }
function renderTransport() {
  $('#current-week').textContent = session.week;
  $('#run-label').textContent = running ? 'Pause' : 'Run';
  $('#run-icon').textContent = running ? 'Ⅱ' : '▶';
  $('#run').setAttribute('aria-label', running ? 'Pause simulation' : 'Run simulation');
  $('#live-dot').classList.toggle('running', running);
  $('#run-state').textContent = session.week === HORIZON ? 'Complete' : running ? 'Running' : 'Paused';
  $('#run').disabled = session.week >= HORIZON;
  $('#step').disabled = session.week >= HORIZON;
  $('#apply-policy').disabled = session.week >= HORIZON;
  $('#apply-week').disabled = session.week >= HORIZON;
  $('#apply-week').min = Math.min(HORIZON, session.week + 1);
  $('#timeline').setAttribute('aria-valuenow', session.week);
  $('#timeline-progress').style.width = `${session.week / HORIZON * 100}%`;
  $('#surge-region').hidden = session.scenario !== 'rush';
}
const initialRow = () => ({ ...createState(), capacity: BASE_CAPACITY * (1 - session.assumptions.fatigueCapacityLoss * 0.08), outstanding: 0, repairWork: 0, cumulativeShipped: 0, usable: 0, overtime: 0, cumulativeDeclined: 0, overdue: 0, hidden: 0, known: 0 });
function renderMetrics() {
  const row = current.history.at(-1) || initialRow();
  $('#usable').textContent = number(row.usable);
  $('#outstanding').textContent = number(row.outstanding);
  $('#capacity').innerHTML = `${number(row.capacity)} <span>/ 12</span>`;
  $('#trust').textContent = number(row.trust * 100, 0);
  $('#overdue-caption').textContent = row.overdue > 0.05 ? `${number(row.overdue)} points overdue` : 'points still to deliver';
}

const chartDefinitions = {
  work: { title: 'Work waiting', unit: 'points', primary: 'outstanding', secondary: 'repairWork', primaryLabel: 'Open promises', secondaryLabel: 'Repair work, incl. hidden', secondaryColor: '#cb8b31', description: 'Promises are due at the end of the following week.' },
  output: { title: 'Done isn’t always done', unit: 'cumulative points', primary: 'usable', secondary: 'cumulativeShipped', primaryLabel: 'Usable output', secondaryLabel: 'Reported delivery', secondaryColor: '#329887', description: 'The gap is delivered work with defects still outstanding.' },
  capacity: { title: 'Capacity & overtime', unit: 'effort points / week', primary: 'capacity', secondary: 'overtime', primaryLabel: 'Team capacity', secondaryLabel: 'Overtime', secondaryColor: '#cb8b31', description: 'Fatigue reduces capacity. Overtime borrows from recovery.' },
};
function legend(label, color, baseline = false) { return `<span class="legend-item${baseline ? ' baseline' : ''}"><i style="--legend-color:${color}"></i>${escapeHtml(label)}</span>`; }
function renderChart() {
  if (!forecast) return;
  const definition = chartDefinitions[session.chart];
  const container = $('#chart');
  const width = Math.max(280, Math.round(container.clientWidth || 760));
  const height = width < 500 ? 220 : 255;
  const margin = { left: 36, right: 12, top: 22, bottom: 29 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rows = [initialRow(), ...forecast.history];
  const baseRows = reference ? [initialRow(), ...reference.history] : null;
  const maxValue = Math.max(1, ...rows.map(r => Math.max(r[definition.primary], r[definition.secondary])), ...(baseRows ? baseRows.map(r => r[definition.primary]) : []));
  const rawStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const tickStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const maximum = Math.ceil(maxValue / tickStep) * tickStep;
  const x = week => margin.left + week / HORIZON * plotWidth;
  const y = value => margin.top + plotHeight * (1 - value / maximum);
  const path = (data, key) => data.map((row, i) => `${i ? 'L' : 'M'}${x(row.week).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ');
  const currentX = x(session.week);
  let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="work-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2457e6" stop-opacity=".09"/><stop offset="100%" stop-color="#2457e6" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<rect x="${currentX}" y="${margin.top}" width="${x(HORIZON) - currentX}" height="${plotHeight}" fill="#f7f9fc"/>`;
  if (session.scenario === 'rush') svg += `<rect x="${x(8.5)}" y="${margin.top}" width="${x(16.5) - x(8.5)}" height="${plotHeight}" fill="#f7e9ca" opacity=".43"/><text x="${x(12.5)}" y="12" text-anchor="middle" style="fill:#aa894d;font-size:9px">demand surge</text>`;
  for (let value = 0; value <= maximum + tickStep / 10; value += tickStep) svg += `<line class="grid-line" x1="${margin.left}" x2="${x(HORIZON)}" y1="${y(value)}" y2="${y(value)}"/><text x="${margin.left - 9}" y="${y(value) + 3}" text-anchor="end">${number(value, value < 1 && value > 0 ? 1 : 0)}</text>`;
  for (const week of [0, 6, 12, 18, 24, 30, 36]) svg += `<text x="${x(week)}" y="${height - 8}" text-anchor="middle">${week === 0 ? 'W0' : week}</text>`;
  if (baseRows) svg += `<path d="${path(baseRows, definition.primary)}" fill="none" stroke="#8c98aa" stroke-width="1.7" stroke-dasharray="3 4"/>`;
  const actual = rows.filter(r => r.week <= session.week);
  const future = rows.filter(r => r.week >= session.week);
  if (actual.length > 1) svg += `<path d="${path(actual, definition.primary)} L${currentX},${y(0)} L${x(0)},${y(0)}Z" fill="url(#work-fill)"/>`;
  for (const [key, color, stroke] of [[definition.secondary, definition.secondaryColor, 1.8], [definition.primary, '#2457e6', 2.5]]) {
    svg += `<path d="${path(future, key)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="6 5" opacity=".65"/><path d="${path(actual, key)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  svg += `<line x1="${currentX}" x2="${currentX}" y1="${margin.top}" y2="${y(0)}" stroke="#bdc9dc" stroke-width="1"/><circle cx="${currentX}" cy="${y(rows[session.week][definition.primary])}" r="4" fill="#2457e6" stroke="white" stroke-width="2"/>`;
  for (const event of session.events) svg += `<path d="M${x(event.week) - 3},${y(0) + 2} l6,0 l-3,5 Z" fill="#12856b"><title>Policy starts in week ${event.week}</title></path>`;
  svg += '</svg>';
  container.innerHTML = svg;
  const currentRow = rows[session.week];
  const endRow = rows.at(-1);
  container.setAttribute('aria-label', `${definition.title}. Week ${session.week}: ${definition.primaryLabel} ${number(currentRow[definition.primary])}; ${definition.secondaryLabel} ${number(currentRow[definition.secondary])}. Projected week 36: ${definition.primaryLabel} ${number(endRow[definition.primary])}. ${baseRows ? `Baseline week 36: ${number(baseRows.at(-1)[definition.primary])}.` : ''} Full data available below.`);
  $('#chart-title').textContent = definition.title;
  $('#chart-legend').innerHTML = legend(definition.primaryLabel, '#2457e6') + legend(definition.secondaryLabel, definition.secondaryColor) + (reference ? legend('Baseline', '#8c98aa', true) : '');
  $('#chart-description').textContent = definition.description;
  document.querySelectorAll('[data-chart]').forEach(button => button.setAttribute('aria-pressed', button.dataset.chart === session.chart));
  $('#chart-data').innerHTML = `<caption class="sr-only">${escapeHtml(definition.title)} by week, in ${definition.unit}. Weeks after ${session.week} are projections.</caption><thead><tr><th scope="col">Week</th><th scope="col">${definition.primaryLabel}</th><th scope="col">${definition.secondaryLabel}</th>${reference ? '<th scope="col">Baseline</th>' : ''}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${row.week}${row.week > session.week ? ' (projected)' : ''}</th><td>${number(row[definition.primary])}</td><td>${number(row[definition.secondary])}</td>${baseRows ? `<td>${number(baseRows[row.week][definition.primary])}</td>` : ''}</tr>`).join('')}</tbody>`;
}

function renderAllocation() {
  const row = current.history.at(-1);
  if (!row) {
    $('#allocation-total').textContent = 'The first week has not run';
    $('#allocation-bar').innerHTML = '';
    $('#allocation-bar').setAttribute('aria-label', 'No capacity has been spent yet.');
    $('#allocation-legend').innerHTML = '';
    $('#week-insight').textContent = 'Run a week to see how the team spends its available effort.';
    return;
  }
  const segments = [
    { label: 'Delivery', value: row.deliveryEffort, color: '#2457e6' },
    { label: 'Repairs', value: row.repairEffort, color: '#d5a255' },
    { label: 'Reporting', value: row.reporting, color: '#8c9bb1' },
    { label: 'Recovery', value: row.recovery, color: '#3a9e87' },
    { label: 'Idle', value: row.idle, color: '#dce3ed' },
  ];
  const total = row.capacity + row.overtime;
  $('#allocation-total').textContent = `${number(row.capacity)} capacity + ${number(row.overtime)} overtime`;
  $('#allocation-bar').innerHTML = segments.filter(s => s.value > 0.001).map(s => `<div class="allocation-segment" style="width:${s.value / total * 100}%;background:${s.color}" title="${s.label}: ${number(s.value)} effort points"></div>`).join('');
  $('#allocation-bar').setAttribute('aria-label', segments.map(s => `${s.label}: ${number(s.value)} effort points`).join('. '));
  $('#allocation-legend').innerHTML = segments.map(s => `<span class="legend-item"><i style="--legend-color:${s.color}"></i>${s.label} <b>${number(s.value)}</b></span>`).join('');
  $('#week-insight').innerHTML = `<strong>${number(row.accepted)} points promised</strong> from ${number(row.demand)} of demand. ${number(row.shipped)} reported delivered; <strong>${number(row.hidden)} points of hidden defects</strong> will return over the next two weeks. Fatigue is ${pct(row.fatigue)}.`;
}
function renderEvents() {
  const upcoming = session.events.filter(event => event.week > session.week);
  $('#scheduled-events').innerHTML = upcoming.map(event => `<div class="event-row"><p><strong>Week ${event.week} · scheduled</strong>${event.policy.commitment}% promises · ${event.policy.quality}% quality · ${event.policy.recovery}% recovery</p><button type="button" data-remove-event="${event.week}" aria-label="Remove policy scheduled for week ${event.week}">×</button></div>`).join('');
  $('#scheduled-events').querySelectorAll('[data-remove-event]').forEach(button => button.addEventListener('click', () => {
    session.events = session.events.filter(e => e.week !== Number(button.dataset.removeEvent));
    compute(); render(); save(); message('Scheduled policy removed.');
  }));
}
function comparisonRows(end, base) {
  return [
    { label: 'Usable output', value: end.usable, base: base.usable, higher: true },
    { label: 'Open promises', value: end.outstanding, base: base.outstanding, higher: false },
    { label: 'Repair work still owed', value: end.repairWork, base: base.repairWork, higher: false },
    { label: 'Work declined', value: end.cumulativeDeclined, base: base.cumulativeDeclined, higher: false, neutral: true },
    { label: 'Trust / 100', value: end.trust * 100, base: base.trust * 100, higher: true, digits: 0 },
  ];
}
function renderComparison() {
  const content = $('#comparison-content');
  $('#fork').disabled = session.week >= HORIZON;
  if (!reference) {
    $('#fork').textContent = 'Fork a baseline ⑂';
    $('#comparison-title').textContent = 'What would change?';
    $('#comparison-intro').textContent = 'Freeze the current policy as a reference. Your next changes affect only your experiment.';
    content.innerHTML = '';
    return;
  }
  const end = forecast.history.at(-1);
  const base = reference.history.at(-1);
  const rows = comparisonRows(end, base);
  $('#fork').textContent = 'Re-fork here';
  $('#comparison-title').textContent = 'At the end of week 36';
  $('#comparison-intro').textContent = `${session.week < HORIZON ? 'Projected from' : 'Completed at'} week ${session.week}. The baseline keeps the policies you pinned in week ${session.baseline.week}. Both courses use the same demand and model assumptions.`;
  const outputDifference = end.usable - base.usable;
  const declinedDifference = end.cumulativeDeclined - base.cumulativeDeclined;
  const noDifference = rows.every(row => Math.abs(row.value - row.base) < 0.05);
  const verdict = noDifference ? 'Both courses match. Change a policy or its start week to see the consequences.' : `<strong>${number(Math.abs(outputDifference))} ${outputDifference >= 0 ? 'more' : 'fewer'} usable points</strong> with ${number(Math.abs(declinedDifference))} ${declinedDifference >= 0 ? 'more' : 'fewer'} points declined. These outcomes come from the same demand sequence.`;
  content.innerHTML = `<table class="comparison-table"><caption class="sr-only">Week 36 outcomes, baseline compared with this experiment. Work values are points.</caption><thead><tr><th scope="col">Outcome</th><th scope="col">Baseline</th><th scope="col">Experiment</th><th scope="col">Change</th></tr></thead><tbody>${rows.map(row => {
    const difference = row.value - row.base;
    const better = row.higher ? difference > 0 : difference < 0;
    const same = Math.abs(difference) < 0.05;
    return `<tr><th scope="row">${row.label}</th><td>${number(row.base, row.digits ?? 1)}</td><td>${number(row.value, row.digits ?? 1)}</td><td class="${row.neutral || same ? '' : better ? 'good-change' : 'bad-change'}">${same ? '—' : `${difference > 0 ? '+' : '−'}${number(Math.abs(difference), row.digits ?? 1)}`}</td></tr>`;
  }).join('')}</tbody></table><p class="comparison-verdict">${verdict}</p><div class="comparison-actions"><span>Forked at week ${session.baseline.week} · seed ${scenario().seed}</span><button id="return-to-fork" class="quiet-button" type="button">Return to fork ↶</button></div>`;
  $('#return-to-fork').addEventListener('click', returnToFork);
}
function render() {
  const focused = document.activeElement;
  const focusedId = focused?.id;
  const focusedEvent = focused?.dataset?.removeEvent;
  renderTransport(); renderMetrics(); renderChart(); renderAllocation(); renderEvents(); renderComparison(); updateDraft(); renderAssumptions();
  // Comparison and event rows are rebuilt. Keep keyboard focus on the matching
  // control, or the nearest remaining event when its remove button disappears.
  if (focused && !focused.isConnected) {
    let replacement = focusedId ? document.getElementById(focusedId) : null;
    if (focusedEvent) {
      const buttons = [...document.querySelectorAll('[data-remove-event]')];
      replacement = buttons.find(button => Number(button.dataset.removeEvent) >= Number(focusedEvent)) || buttons.at(-1) || $('#apply-policy');
    }
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
  }
}
function advance() {
  if (session.week >= HORIZON) return;
  session.week++;
  if (Number($('#apply-week').value) <= session.week) { $('#apply-week').value = Math.min(HORIZON, session.week + 1); updateTiming(); }
  compute(); render(); save();
  if (session.week >= HORIZON) { pause(); announce(`Experiment complete. ${number(current.history.at(-1).usable)} usable points delivered. Reset or return to your fork to try another course.`); }
}
function tick() { if (!running) return; advance(); if (running) timer = setTimeout(tick, 700); }
function run() { if (session.week >= HORIZON) return; running = true; renderTransport(); timer = setTimeout(tick, 450); }
function applyPolicy(policy, week) {
  if (!Number.isInteger(week) || week <= session.week || week > HORIZON) throw new Error('Choose a whole week after the current week and no later than week 36.');
  session.events = schedulePolicy(session.events, week, policy);
  compute(); render(); save();
  message(`Policy scheduled for week ${week}. ${running ? 'The simulation is running.' : 'Run to watch it unfold.'}`);
  announce(`Policy scheduled in week ${week}.`);
}
function fork() {
  pause();
  if (session.week >= HORIZON) return;
  session.baseline = { week: session.week, events: structuredClone(session.events) };
  compute(); render(); save();
  message(`Baseline pinned at week ${session.week}. Now change your policy.`);
  announce(`Baseline pinned at week ${session.week}.`);
}
function returnToFork() {
  if (!session.baseline) return;
  pause();
  session.week = session.baseline.week;
  session.events = structuredClone(session.baseline.events);
  compute(); setDraft(); render(); save();
  message(`Back at week ${session.week}. Try a different policy or start week.`);
}
function reset(startWeek = 0, scenarioId = session.scenario) {
  pause();
  session = { ...initial, scenario: scenarioId, week: startWeek, chart: session.chart, events: [], baseline: null, assumptions: session.assumptions };
  $('#scenario').value = scenarioId;
  $('#scenario-description').textContent = scenario().description;
  compute(); setDraft(); render(); save();
  message(startWeek ? 'Scenario opens after six weeks. Your choices start next week.' : 'Fresh start. Policies and the baseline cleared; model assumptions kept.');
  announce(startWeek ? `${scenario().name}. Week 6.` : 'Scenario reset to week 0.');
}
function readAssumptionsDraft() {
  return { repairCost: Number($('#assumption-repair').value), fatigueCapacityLoss: Number($('#assumption-fatigue').value) / 100, lateReportingCost: Number($('#assumption-reporting').value) / 10 };
}
function updateAssumptionsDraft() {
  const draft = readAssumptionsDraft();
  $('#assumption-repair-value').value = `${number(draft.repairCost)} ×`;
  $('#assumption-fatigue-value').value = pct(draft.fatigueCapacityLoss);
  $('#assumption-reporting-value').value = number(draft.lateReportingCost * 10, 2);
  const same = Object.keys(draft).every(key => Math.abs(draft[key] - session.assumptions[key]) < 1e-9);
  $('#assumptions-status').textContent = same ? 'Applied to both courses.' : 'Draft changes. Replay to apply.';
}
function setAssumptionsDraft() {
  $('#assumption-repair').value = session.assumptions.repairCost;
  $('#assumption-fatigue').value = session.assumptions.fatigueCapacityLoss * 100;
  $('#assumption-reporting').value = session.assumptions.lateReportingCost * 10;
  updateAssumptionsDraft();
}
function renderAssumptions() {
  const custom = Object.keys(DEFAULT_ASSUMPTIONS).some(key => Math.abs(session.assumptions[key] - DEFAULT_ASSUMPTIONS[key]) > 1e-9);
  $('#assumptions-summary').textContent = custom ? 'Custom assumptions · both courses' : 'Three illustrative assumptions';
  $('#equation-fatigue').textContent = number(session.assumptions.fatigueCapacityLoss, 2);
  $('#equation-repair').textContent = number(session.assumptions.repairCost);
  $('#equation-reporting').textContent = number(session.assumptions.lateReportingCost * 10, 2);
}
function applyAssumptions(assumptions) {
  pause();
  session.assumptions = normalizeAssumptions(assumptions);
  compute(); render(); save(); setAssumptionsDraft();
  const text = `Replayed both courses from week 1. You are still at week ${session.week}; policies are unchanged.`;
  $('#assumptions-status').textContent = lastStorageSuccess ? text : `${text} Browser storage is unavailable; export to keep these assumptions.`;
  announce(text);
}
function exportExperiment() {
  const currentRow = current.history.at(-1) || initialRow();
  const final = forecast.history.at(-1);
  const policyText = p => `${p.commitment}% promise rate, ${p.quality}% quality protection, ${p.recovery}% recovery`;
  const lines = [
    '# Commitment Spiral experiment', '', `Scenario: ${scenario().name} (seed ${scenario().seed}). Saved at week ${session.week} of ${HORIZON}.`, '',
    '## Shared model assumptions', '', `Repair cost: ${number(session.assumptions.repairCost)} effort points per defective point (illustrative default: 1.7).`, `Maximum capacity loss from fatigue: ${pct(session.assumptions.fatigueCapacityLoss)} (default: 45%).`, `Late-work reporting: ${number(session.assumptions.lateReportingCost * 10, 2)} effort points per 10 overdue points (default: 0.65).`, '', 'These assumptions apply from week 1 to both courses. Changing them replays all history while preserving policies, demand and the selected week. Trust-related reporting remains active.', '',
    '## Policies', '', `Initial policy: ${policyText(scenario().policy)}.`, ...session.events.map(event => `- Week ${event.week}: ${policyText(event.policy)}${event.week > session.week ? ' (scheduled)' : ''}.`), '',
    '## State now', '', `${number(currentRow.usable)} usable points; ${number(currentRow.outstanding)} open promises; ${number(currentRow.repairWork)} repair effort outstanding; trust ${number(currentRow.trust * 100, 0)}/100.`, '',
    `## ${session.week < HORIZON ? 'Projected' : 'Completed'} week 36`, '',
  ];
  if (reference) {
    lines.push(`Baseline forked in week ${session.baseline.week}. Both branches use the same demand.`, '', '| Outcome | Baseline | Experiment |', '| --- | ---: | ---: |', ...comparisonRows(final, reference.history.at(-1)).map(row => `| ${row.label} | ${number(row.base, row.digits ?? 1)} | ${number(row.value, row.digits ?? 1)} |`), '', 'Baseline policies:', `Initial: ${policyText(scenario().policy)}.`, ...session.baseline.events.map(event => `- Week ${event.week}: ${policyText(event.policy)}.`), '');
  } else lines.push(`${number(final.usable)} usable points; ${number(final.outstanding)} open promises; ${number(final.cumulativeDeclined)} points declined; trust ${number(final.trust * 100, 0)}/100.`, '');
  lines.push('## Model limits', '', 'Fictional, divisible work and illustrative coefficients; this is a mechanism experiment, not an empirical forecast. Nominal capacity is 12 effort points per week. Promises are due by the end of the following week. Defects return after two weeks. Fatigue can reduce capacity; overdue work and lost trust create reporting load, using the shared assumptions above. Usable output excludes outstanding defects, including hidden ones.', '', '## Weekly data', '', '| Week | Status | Demand | Promised | Open | Repair work | Usable output | Capacity | Trust |', '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |', ...forecast.history.map(row => `| ${row.week} | ${row.week <= session.week ? 'simulated' : 'projected'} | ${number(row.demand)} | ${number(row.accepted)} | ${number(row.outstanding)} | ${number(row.repairWork)} | ${number(row.usable)} | ${number(row.capacity)} | ${number(row.trust * 100, 0)} |`));
  downloadText(`commitment-${session.scenario}-week-${session.week}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  announce('Experiment exported as Markdown.');
}

$('#policy-form').addEventListener('submit', event => { event.preventDefault(); try { applyPolicy(draftPolicy(), Number($('#apply-week').value)); } catch (error) { message(error.message, true); } });
for (const key of ['commitment', 'quality', 'recovery']) $(`#${key}`).addEventListener('input', updateDraft);
$('#apply-week').addEventListener('input', updateTiming);
$('#scenario').addEventListener('change', event => reset(6, event.target.value));
$('#run').addEventListener('click', () => running ? pause() : run());
$('#step').addEventListener('click', () => { pause(); advance(); announce(`Week ${session.week}. ${number(current.history.at(-1)?.outstanding || 0)} open promises.`); });
$('#reset').addEventListener('click', () => reset());
$('#fork').addEventListener('click', fork);
$('#export').addEventListener('click', exportExperiment);
$('#assumptions-form').addEventListener('submit', event => { event.preventDefault(); applyAssumptions(readAssumptionsDraft()); });
for (const id of ['assumption-repair', 'assumption-fatigue', 'assumption-reporting']) $(`#${id}`).addEventListener('input', updateAssumptionsDraft);
$('#reset-assumptions').addEventListener('click', () => applyAssumptions(DEFAULT_ASSUMPTIONS));
document.querySelectorAll('[data-chart]').forEach(button => button.addEventListener('click', () => { session.chart = button.dataset.chart; renderChart(); save(); }));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
let resizeFrame;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderChart); });
$('#scenario').value = session.scenario;
$('#scenario-description').textContent = scenario().description;
compute(); setDraft(); setAssumptionsDraft(); render();

// The browser can ignore this entirely. When supported, tools operate the real UI state.
const modelContext = document.modelContext ?? navigator.modelContext;
if (modelContext && typeof modelContext.registerTool === 'function') {
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const readState = () => ({ scenario: session.scenario, week: session.week, running, policy: livePolicy(), assumptions: session.assumptions, scheduled: session.events, baselineWeek: session.baseline?.week ?? null, current: current.history.at(-1) || initialRow(), projectedWeek36: forecast.history.at(-1) });
  const unavailable = error => console.info('Optional browser model tools unavailable:', error?.message || String(error));
  const register = tool => {
    try { Promise.resolve(modelContext.registerTool(tool)).catch(unavailable); }
    catch (error) { unavailable(error); }
  };
  const requireObject = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provide an object with the documented parameters.');
  };
  register({ name: 'commitment_get_state', description: 'Read the Commitment Spiral experiment, current policy, state and projection.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: async (args = {}) => { requireObject(args); if (Object.keys(args).length) throw new Error('This tool takes no parameters.'); return result(readState()); } });
  register({ name: 'commitment_schedule_policy', description: 'Schedule a policy in a future week of the current experiment. Promise rate is 40–100%, quality 0–100%, recovery 0–25%.', inputSchema: { type: 'object', properties: { week: { type: 'integer', minimum: 1, maximum: 36 }, commitment: { type: 'number', minimum: 40, maximum: 100 }, quality: { type: 'number', minimum: 0, maximum: 100 }, recovery: { type: 'number', minimum: 0, maximum: 25 } }, required: ['week', 'commitment', 'quality', 'recovery'], additionalProperties: false }, execute: async args => {
    requireObject(args);
    if (Object.keys(args).some(key => !['week', 'commitment', 'quality', 'recovery'].includes(key))) throw new Error('Unknown policy parameter.');
    for (const [key, min, max] of [['commitment', 40, 100], ['quality', 0, 100], ['recovery', 0, 25]]) if (!Number.isFinite(args[key]) || args[key] < min || args[key] > max) throw new Error(key + ' must be a number from ' + min + ' to ' + max + '.');
    if (!Number.isInteger(args.week) || args.week <= session.week || args.week > HORIZON) throw new Error('Start week must be after the current week and no later than 36.');
    const { week, ...policy } = args;
    pause(); applyPolicy(policy, week); setDraft(policy); $('#apply-week').value = week; updateTiming(); updateDraft();
    return result(readState());
  } });
  register({ name: 'commitment_control', description: 'Step one week, run, pause, fork a baseline, return to the fork, or reset this experiment.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['step', 'run', 'pause', 'fork', 'return_to_fork', 'reset'] } }, required: ['action'], additionalProperties: false }, execute: async args => {
    requireObject(args);
    const { action } = args;
    if (Object.keys(args).some(key => key !== 'action') || !['step', 'run', 'pause', 'fork', 'return_to_fork', 'reset'].includes(action)) throw new Error('Choose a documented simulation action.');
    if (action === 'return_to_fork' && !session.baseline) throw new Error('Fork a baseline before returning to it.');
    if (['step', 'run', 'fork'].includes(action) && session.week >= HORIZON) throw new Error('This run has finished. Reset or return to the fork first.');
    if (action === 'step') { pause(); advance(); } else if (action === 'run') { pause(); run(); } else if (action === 'pause') pause(); else if (action === 'fork') fork(); else if (action === 'return_to_fork') returnToFork(); else if (action === 'reset') reset();
    return result(readState());
  } });
}
