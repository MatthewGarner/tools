import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experiments } from '../lab/dist/shared/catalog.js';
import { sketch } from './front-door-art.mjs';

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

// The front door (home/index.html, served at `/`): rooms in the spec's order, all from the catalogue.
const current = SUITE_CATALOG.filter(t => t.maturity !== 'archived');
const byId = new Map(SUITE_CATALOG.map(t => [t.id, t]));
const inRoom = room => current.filter(t => t.room === room);
const featuredIn = room => inRoom(room).filter(t => t.featured !== undefined).sort((a, b) => a.featured - b.featured);
const modelsFilter = { type: 'model' };
const modelCount = filterCatalog(modelsFilter).length;   // the size of the list the link opens
const modelsHref = '/explore/' + filtersToSearch(modelsFilter);
const link = (tool, cls, inner) => `<a${cls ? ` class="${cls}"` : ''} href="${escape(toolHref(tool))}">${inner}</a>`;
const jobRow = ([job, { title, order }]) => {
  const tools = order.map(id => byId.get(id));
  const flagship = tools.find(t => t.featured !== undefined), rest = tools.filter(t => t !== flagship);
  return `    <li class="door-job" data-job="${job}">
      <h3 class="door-job-title">${escape(title)}</h3>
      ${link(flagship, 'door-flagship', `${sketch(flagship.route)}<span class="door-copy"><span class="door-name">${escape(flagship.title)}</span><span class="door-line">${escape(flagship.description)}</span></span>`)}${rest.length ? `
      <ul class="door-also" aria-label="Also for: ${escape(title)}">
${rest.map(t => `        <li>${link(t, '', `<span class="door-name">${escape(t.title)}</span><span class="door-line">${escape(t.description)}</span>`)}</li>`).join('\n')}
      </ul>` : ''}
    </li>`;
};
const card = tool => `      <li>${link(tool, 'door-card', `${sketch(tool.route)}<span class="door-copy"><span class="door-name">${escape(tool.title)}</span><span class="door-line">${escape(tool.description)}</span></span>`)}</li>`;
const bench = tool => `      <li>${link(tool, '', `<span class="door-name">${escape(tool.title)}</span><span class="door-line">${escape(tool.description)}</span>`)}</li>`;
const lite = Object.fromEntries(current.map(t => [t.id, [t.title, toolHref(t)]]));
const doorMarkup = `<!-- front-door:start -->
<section class="door-room" id="instruments" aria-labelledby="instruments-h">
  <header class="door-head"><h2 id="instruments-h">${ROOMS.instrument}</h2><p>Bring a decision. Leave with something you can show.</p></header>
  <ol class="door-jobs">
${Object.entries(JOBS).map(jobRow).join('\n')}
  </ol>
</section>
<section class="door-room" id="models" aria-labelledby="models-h">
  <header class="door-head"><h2 id="models-h">${ROOMS.model}</h2><p>Play a mechanism for ten minutes.</p></header>
  <ul class="door-cards">
${featuredIn('model').map(card).join('\n')}
  </ul>
  <p class="door-more"><a href="${modelsHref}">All ${modelCount} models</a></p>
</section>
<section class="door-room" id="workbenches" aria-labelledby="workbenches-h">
  <header class="door-head"><h2 id="workbenches-h">${ROOMS.workbench}</h2><p>Find a different way into a problem.</p></header>
  <ul class="door-bench">
${inRoom('workbench').map(bench).join('\n')}
  </ul>
</section>
<section class="door-room door-energy" id="energy" aria-labelledby="energy-h">
  <header class="door-head"><h2 id="energy-h"><a href="/energy/">Energy</a></h2><p>Batteries and power markets, on their own site.</p></header>
  <ul class="door-energy-list" aria-label="Energy tools">
${current.filter(t => t.source === 'energy').map(t => `    <li>${link(t, '', escape(t.title))}</li>`).join('\n')}
  </ul>
</section>
<p class="door-foot"><a href="/explore/">Search all ${current.length} tools</a></p>
<script type="application/json" id="door-catalog">${JSON.stringify(lite).replace(/</g, '\\u003c')}</script>
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
