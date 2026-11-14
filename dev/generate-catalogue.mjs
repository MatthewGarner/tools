import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experiments } from '../lab/dist/shared/catalog.js';
import { sketch } from './front-door-art.mjs';
import { STATS } from './front-door-stats.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const subjects={
  authority:['teams','systems'],context:['teams','systems'],consistency:['teams','systems'],alignment:['teams','product'],possibilities:['teams','product'],clocks:['teams','systems'],
  commitment:['teams','systems'],teams:['teams'],exploration:['product','teams'],
  flexibility:['energy','systems'],delay:['systems'],exceptions:['teams','systems'],
  knowledge:['teams'],local:['teams','systems'],predictions:['systems'],accuracy:['energy','product'],
  reliability:['systems'],adoption:['product','systems'],interventions:['ideas','systems'],
};
// The front door's tiers: scaffolds are workbenches, every other Lab page a model; four models are pictured.
// Order numbers continue the product-side list in assets/suite-catalog.js (Flow 1, Alarm 2).
const labFeatured={commitment:3,delay:4,teams:5,context:6};
const lab = experiments.map(experiment => ({
  id: `lab:${experiment.route}`, route: experiment.route, title: experiment.title,
  description: experiment.question, type: experiment.kind,
  keywords: `${experiment.route} ${experiment.caption}${['flexibility', 'accuracy'].includes(experiment.route) ? ' battery bess decisions energy' : ''}`,
  domains: subjects[experiment.route] || ['ideas'],
  maturity: ['archived', 'merged'].includes(experiment.status) ? 'archived' : 'experimental',
  status: experiment.status ?? 'active', source: 'lab',
  room: experiment.kind === 'scaffold' ? 'workbench' : 'model',
  ...(labFeatured[experiment.route] ? { featured: labFeatured[experiment.route] } : {}),
  ...(experiment.archiveReason ? { archiveReason: experiment.archiveReason } : {}),
  ...(experiment.mergedInto ? { mergedInto: experiment.mergedInto } : {}),
}));

const moduleFile = path.join(root, 'assets/suite-catalog.js');
const original = fs.readFileSync(moduleFile, 'utf8');
const moduleSource = original.replace(/\/\/ lab-catalogue:start[\s\S]*?\/\/ lab-catalogue:end/, `// lab-catalogue:start\nconst lab = [\n${lab.map(entry => '  ' + JSON.stringify(entry)).join(',\n')},\n];\n// lab-catalogue:end`);
const { SUITE_CATALOG, DOMAINS, TYPES, MATURITIES, ROOMS, JOBS, toolHref, filtersToSearch, filterCatalog } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

function row(tool) {
  const meta = [...tool.domains.map(c => DOMAINS[c]), TYPES[tool.type], MATURITIES[tool.maturity]].join(' · ');
  return `    <li class="explore-row" data-catalog-id="${escape(tool.id)}"><a href="${escape(toolHref(tool))}"><h2>${escape(tool.title)}</h2><div class="explore-copy"><p>${escape(tool.description)}</p><span class="explore-meta">${escape(meta)}</span>${tool.archiveReason ? `<span class="explore-meta">${escape(tool.archiveReason)}</span>` : ''}</div><span class="explore-arrow" aria-hidden="true">→</span></a><button type="button" class="explore-favourite" data-favourite-toggle aria-label="Add ${escape(tool.title)} to favourites" aria-pressed="false" hidden><span aria-hidden="true">☆</span></button></li>`;
}
const markup = `<!-- suite-catalog:start -->
  <ul class="explore-list" aria-label="Current tools">
${SUITE_CATALOG.filter(t => t.maturity !== 'archived').map(row).join('\n')}
  </ul>
  <details class="explore-archives" data-archive-list>
    <summary>Archived and merged experiments</summary>
    <ul class="explore-list" aria-label="Archived and merged experiments">
${SUITE_CATALOG.filter(t => t.maturity === 'archived').map(row).join('\n')}
    </ul>
  </details>
<!-- suite-catalog:end -->`;

// The front door (home/index.html, served at `/`): four classes in the character-select device, all from the catalogue.
// Every tool is written as a full card (art, kicker, name, description, stats, Open link), grouped by class, so the page
// reads as four plain lists without JavaScript; assets/front-door-device.js turns the lists into the device.
const current = SUITE_CATALOG.filter(t => t.maturity !== 'archived');
const byId = new Map(SUITE_CATALOG.map(t => [t.id, t]));
const inRoom = room => current.filter(t => t.room === room);
const featuredFirst = tools => [...tools.filter(t => t.featured !== undefined).sort((a, b) => a.featured - b.featured), ...tools.filter(t => t.featured === undefined)];
const instrumentJob = tool => JOBS[tool.job].title;
const instrumentCards = Object.values(JOBS).flatMap(({ order }) => featuredFirst(order.map(id => byId.get(id))));
const TIME = ['', '10 minutes', 'Half an hour', 'An hour or more'], PLAYERS = ['', 'Solo', 'Solo or pair', 'Best with a group'];
// id, label, short label (phone control), line, the tools in order, the kicker for one of them, and the label of the first stat.
const CLASSES = [
  { id: 'instruments', label: ROOMS.instrument, short: 'Instruments', line: 'Bring a decision', tools: instrumentCards, kicker: t => `${ROOMS.instrument} · ${instrumentJob(t)}`, leave: 'You leave with' },
  { id: 'models', label: ROOMS.model, short: 'Models', line: 'Play a mechanism', tools: featuredFirst(inRoom('model').filter(t => t.source !== 'energy')), kicker: () => ROOMS.model, leave: 'You find out' },
  { id: 'workbenches', label: ROOMS.workbench, short: 'Benches', line: 'Another way in', tools: inRoom('workbench'), kicker: () => ROOMS.workbench, leave: 'You leave with' },
  { id: 'energy', label: 'Energy', short: 'Energy', line: 'Batteries and power markets', tools: current.filter(t => t.source === 'energy'), kicker: () => 'Energy', leave: 'You find out' },
];
const bars = n => `<span class="door-bar" style="--n:${n}" aria-hidden="true"></span>`;
const stat = (label, value, n) => `<div><dt>${label}</dt><dd>${n ? bars(n) : ''}<span>${escape(value)}</span></dd></div>`;
const doorCard = (cls, tool) => {
  const stats = STATS[tool.id], href = escape(toolHref(tool));
  return `    <li class="door-card" data-id="${escape(tool.id)}"${tool.job ? ` data-job="${escape(instrumentJob(tool))}"` : ''}>
      <a class="door-art" href="${href}" tabindex="-1" aria-hidden="true">${sketch(tool.route)}</a>
      <div class="door-body">
        <p class="door-kicker">${escape(cls.kicker(tool))}</p>
        <h3 class="door-name">${escape(tool.title)}</h3>
        <p class="door-line">${escape(tool.description)}</p>
        <dl class="door-stats">${stat(cls.leave, stats.leaveWith)}${stat('Time', TIME[stats.time], stats.time)}${stat('Players', PLAYERS[stats.players], stats.players)}</dl>
        <a class="door-open" href="${href}">Open ${escape(tool.title)}</a>
      </div>
    </li>`;
};
const doorClass = cls => `<section class="door-class" id="${cls.id}" data-class="${cls.id}" data-label="${escape(cls.label)}" data-short="${escape(cls.short)}" data-line="${escape(cls.line)}" aria-labelledby="${cls.id}-h">
  <header class="door-head"><h2 id="${cls.id}-h">${escape(cls.label)}</h2><p>${escape(cls.line)}</p></header>
  <ul class="door-list">
${cls.tools.map(t => doorCard(cls, t)).join('\n')}
  </ul>
</section>`;
const lite = Object.fromEntries(current.map(t => [t.id, [t.title, toolHref(t)]]));
const doorMarkup = `<!-- front-door:start -->
<div class="door-rooms" data-door-rooms>
${CLASSES.map(doorClass).join('\n')}
</div>
<p class="door-foot"><a href="/explore/">Search all ${current.length} tools</a></p>
<script type="application/json" id="door-catalog">${JSON.stringify(lite).replace(/</g, '\\u003c')}</script>
<script src="/assets/front-door-device.js"></script>
<!-- front-door:end -->`;
const doorFile = path.join(root, 'home/index.html');
const doorOriginal = fs.readFileSync(doorFile, 'utf8');
const door = doorOriginal.replace(/<!-- front-door:start -->[\s\S]*?<!-- front-door:end -->/, () => doorMarkup);
const pageFile = path.join(root, 'explore/index.html');
const pageOriginal = fs.readFileSync(pageFile, 'utf8');
const activeCount = SUITE_CATALOG.filter(t => t.maturity !== 'archived').length;
const page = pageOriginal.replace(/<!-- suite-catalog:start -->[\s\S]*?<!-- suite-catalog:end -->/, markup)
  .replace(/(data-result-count>)[^<]*/, `$1${activeCount} tools`);
let stale = false;
for (const [file, previous, next] of [[moduleFile, original, moduleSource], [pageFile, pageOriginal, page], [doorFile, doorOriginal, door]]) {
  if (previous === next) continue;
  if (check) { console.error(`Catalogue is stale: ${path.relative(root, file)}`); stale = true; }
  else fs.writeFileSync(file, next);
}
if (stale) process.exitCode = 1;
else console.log(`Catalogue ${check ? 'verified' : 'generated'}: ${activeCount} current, ${SUITE_CATALOG.length - activeCount} archived.`);
