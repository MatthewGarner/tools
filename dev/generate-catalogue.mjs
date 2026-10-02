import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experiments } from '../lab/dist/shared/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const subjects={
  commitment:['teams','systems'],teams:['teams'],exploration:['product','teams'],
  flexibility:['energy','systems'],delay:['systems'],exceptions:['teams','systems'],
  knowledge:['teams'],local:['teams','systems'],predictions:['systems'],accuracy:['energy','product'],
  reliability:['systems'],adoption:['product','systems'],interventions:['ideas','systems'],
};
const lab = experiments.map(experiment => ({
  id: `lab:${experiment.route}`, route: experiment.route, title: experiment.title,
  description: experiment.question, type: experiment.kind,
  keywords: `${experiment.route} ${experiment.caption}${['flexibility', 'accuracy'].includes(experiment.route) ? ' battery bess decisions energy' : ''}`,
  domains: subjects[experiment.route] || ['ideas'],
  maturity: ['archived', 'merged'].includes(experiment.status) ? 'archived' : 'experimental',
  status: experiment.status ?? 'active', source: 'lab',
  ...(experiment.archiveReason ? { archiveReason: experiment.archiveReason } : {}),
  ...(experiment.mergedInto ? { mergedInto: experiment.mergedInto } : {}),
}));

const moduleFile = path.join(root, 'assets/suite-catalog.js');
const original = fs.readFileSync(moduleFile, 'utf8');
const moduleSource = original.replace(/\/\/ lab-catalogue:start[\s\S]*?\/\/ lab-catalogue:end/, `// lab-catalogue:start\nconst lab = ${JSON.stringify(lab, null, 2)};\n// lab-catalogue:end`);
const { SUITE_CATALOG, DOMAINS, TYPES, MATURITIES, toolHref } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

function row(tool) {
  const meta = [...tool.domains.map(c => DOMAINS[c]), TYPES[tool.type], MATURITIES[tool.maturity]].join(' · ');
  return `    <li class="explore-row" data-catalog-id="${escape(tool.id)}"><a href="${escape(toolHref(tool))}"><h2>${escape(tool.title)}</h2><div class="explore-copy"><p>${escape(tool.description)}</p><span class="explore-meta">${escape(meta)}</span>${tool.archiveReason ? `<span class="explore-meta">${escape(tool.archiveReason)}</span>` : ''}</div><span class="explore-arrow" aria-hidden="true">→</span></a></li>`;
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
const pageFile = path.join(root, 'explore/index.html');
const pageOriginal = fs.readFileSync(pageFile, 'utf8');
const activeCount = SUITE_CATALOG.filter(t => t.maturity !== 'archived').length;
const page = pageOriginal.replace(/<!-- suite-catalog:start -->[\s\S]*?<!-- suite-catalog:end -->/, markup)
  .replace(/(data-result-count>)[^<]*/, `$1${activeCount} tools`);
let stale = false;
for (const [file, previous, next] of [[moduleFile, original, moduleSource], [pageFile, pageOriginal, page]]) {
  if (previous === next) continue;
  if (check) { console.error(`Catalogue is stale: ${path.relative(root, file)}`); stale = true; }
  else fs.writeFileSync(file, next);
}
if (stale) process.exitCode = 1;
else console.log(`Catalogue ${check ? 'verified' : 'generated'}: ${activeCount} current, ${SUITE_CATALOG.length - activeCount} archived.`);
