/* One conservative selection policy for local work and CI. Unknown scope is full. */
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {posix, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {LAB_ROUTES} from './suite-pages.mjs';
import {HANDOFF_CONTRACTS} from './handoff-contracts.mjs';
import {workers} from './gen-sw.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CORE_TOOLS = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(t => 'energy/' + t)];
export const TOOL_ROOTS = [...CORE_TOOLS, ...LAB_ROUTES.map(t => 'lab/dist/' + t)];
export const SUITES = JSON.parse(readFileSync(new URL('./pw/package.json', import.meta.url))).scripts.verify
  .split('&&').map(s => s.trim().replace(/^node\s+/, ''));

// These scripts implement per-tool scopes. Others remain whole integration journeys.
export const FILTER_TOOLS = {
  'smoke.mjs': CORE_TOOLS,
  'mobile.mjs': CORE_TOOLS,
  'webkit.mjs': CORE_TOOLS,
  'layout.mjs': ['roadmap','tree','why','map','wardley','bets','gauge','timeline','case','paths','proxy','energy/risk','energy/cycles'],
  'check-eip.mjs': ['tree','why','roadmap','map','wardley','timeline','bets','gauge','paths','energy/risk','energy/cycles'],
  'motion.mjs': ['alarm','flow','energy/merit-order','timeline','tree','why','roadmap','map','bets','gauge','wardley','energy/risk','energy/cycles','energy/intraday'],
};
const all = TOOL_ROOTS;
export const SUITE_TOOLS = {
  ...FILTER_TOOLS,
  'lab-migration.mjs': LAB_ROUTES.map(t => 'lab/dist/' + t),
  'backup.mjs': all, 'suite.mjs': all, 'recent-work.mjs': all, 'identity.mjs': all,
  'design-bar.mjs': all,
  'energy-design-bar.mjs': ENERGY_TOOL_DIRS.map(t => 'energy/' + t),
  'workshop-design.mjs': ['flow','alarm','duel','premortem','gauge'],
  'intraday-export.mjs': ['energy/intraday'], 'frequency.mjs': ['energy/frequency'],
  'check.mjs': ['roadmap'], 'chapter.mjs': ['roadmap','case'],
  'chapter-interactions.mjs': ['roadmap'], 'timeline.mjs': ['timeline'],
  'paths-budget.mjs': ['paths'], 'map.mjs': ['map','gauge'], 'case.mjs': ['case'],
  'gauge.mjs': ['gauge','fermi'], 'signal.mjs': ['signal-vs-noise'],
  'pwa.mjs': CORE_TOOLS, 'pwa-upgrade.mjs': CORE_TOOLS,
};

export function toolId(value){
  let name = value.replace(/^\/+|\/+$/g, '').split('#')[0];
  if(ENERGY_TOOL_DIRS.includes(name)) name = 'energy/' + name;
  if(name.startsWith('lab/') && !name.startsWith('lab/dist/')) name = name.replace('lab/', 'lab/dist/');
  if(!TOOL_ROOTS.includes(name)) throw new Error('Unknown tool: ' + value);
  return name;
}
export function owner(path){ return TOOL_ROOTS.find(t => path.startsWith(t + '/')); }
const DOCS = new Set(['AGENTS.md','CLAUDE.md','README.md','ARCHITECTURE.md','DSL.md','CONSOLIDATION.md','energy/README.md']);
export const isDocumentation = path => DOCS.has(path) || /^docs\/.*\.md$/.test(path) ||
  /^lab\/docs\/.*\.md$/.test(path) || (owner(path) && /\/(README|CONTEXT)\.md$/.test(path));

export function expandTools(tools, edges){
  const affected = new Set(tools);
  let changed = true;
  while(changed){
    changed = false;
    for(const [dependency, consumer] of edges)
      if(affected.has(dependency) && !affected.has(consumer)){ affected.add(consumer); changed = true; }
  }
  return [...affected].sort();
}

/* Literal references in JS, CSS and HTML, plus explicit URL handoffs. This is
   deliberately not advertised as a complete JS dependency parser. Computed
   imports, missing files, shared code and deletions choose the full gate. */
export function dependencyEdges(sources){
  const edges = [], references = [];
  for(const [file, source] of sources){
    // Release manifests enumerate every asset; they are generated dependents,
    // not a reason that a calculator edit changes every other tool's behavior.
    if(['home/sw.js','energy/sw.js'].includes(file)) continue;
    for(const match of source.matchAll(/\bimport\s*\(/g)){
      const operand = source.slice(match.index + match[0].length);
      if(!/^\s*(?:'[^']*'|"[^"]*"|`[^`$]*`)\s*\)/.test(operand))
        return {edges, references, uncertain:file + ': computed or unrecognised import'};
    }
    for(const match of source.matchAll(/\bnew\s+Worker\s*\(/g)){
      const operand = source.slice(match.index + match[0].length);
      if(!/^\s*(?:new\s+URL\(\s*)?(?:'[^']*'|"[^"]*"|`[^`$]*`)\s*[,)]/.test(operand))
        return {edges, references, uncertain:file + ': computed or unrecognised worker'};
    }
    const addReference = ref => {
      ref = ref.split(/[?#]/)[0];
      if(!/^(?:\.{1,2}\/|\/(?!\/))/.test(ref) || !/\.(js|mjs|css|html|json|svg|png|woff2)$/.test(ref)) return;
      const target = ref.startsWith('/') ? ref.slice(1) : posix.normalize(posix.join(posix.dirname(file), ref));
      references.push([target,file]);
    };
    // CSS permits unquoted url() operands; quoted-string scanning alone drops
    // @import url(../another-tool/style.css) and its reverse dependency.
    for(const match of source.matchAll(/\burl\(\s*(?:(["'])(.*?)\1|([^\s)]+))\s*\)/g)) addReference(match[2] || match[3]);
    for(const match of source.matchAll(/["'`](\.{1,2}\/[^"'`\s<>]+|\/(?!\/)[^"'`\s<>]+)["'`]/g)){
      // Directory navigation links are not module dependencies. URL handoffs
      // are covered explicitly below; files propagate by their actual path.
      addReference(match[1]);
    }
  }
  for(const contract of HANDOFF_CONTRACTS){
    const [from, to] = contract.route.split(' → ').map(s => toolId(s));
    edges.push([from, to], [to, from]);
  }
  return {edges, references};
}

export function planChanges(paths, {edges = [], references = [], deleted = [], generated = [], uncertain} = {}){
  const files = [...new Set(paths)].sort();
  const full = reason => ({mode:'full', files, tools:[], suites:SUITES, reasons:[reason]});
  if(uncertain) return full(uncertain);
  if(deleted.length) return full('Deleted or renamed paths: ' + deleted.join(', '));
  if(SUITES.some(s => !SUITE_TOOLS[s])) return full('A browser suite has no ownership metadata');
  if(!files.length) return {mode:'none', files, tools:[], suites:[], reasons:['No changes against the base or in the worktree']};
  if(files.every(isDocumentation)) return {mode:'docs', files, tools:[], suites:[], reasons:['Only allowlisted documentation changed']};
  const changed = new Set();
  for(const file of files){
    if(isDocumentation(file) || generated.includes(file)) continue;
    const tool = owner(file);
    if(!tool) return full('Shared, infrastructure or unknown path: ' + file);
    changed.add(tool);
  }
  if(!changed.size) return full('Generated files changed without an owned source change');
  // Start dependency propagation at changed FILES, not every file owned by
  // their tool. Roadmap's legacy CodeMirror URL is imported widely; changing
  // its parser must not pretend that the shared editor bundle also changed.
  const dependentFiles = expandTools(files.filter(f => !generated.includes(f)), references);
  for(const file of dependentFiles){
    if(files.includes(file)) continue;
    const tool = owner(file);
    if(!tool) return full('Changed file is consumed by shared code: ' + file);
    changed.add(tool);
  }
  const tools = expandTools(changed, edges);
  if(tools.includes('*')) return full('Affected tool is referenced by shared code or a catalogue page');
  const suites = SUITES.filter(s => SUITE_TOOLS[s].some(t => tools.includes(t)));
  if(tools.some(t => !suites.some(s => SUITE_TOOLS[s].includes(t)))) return full('Tool has no browser coverage');
  return {mode:'affected', files, tools, suites, reasons:[
    'Changed tools: ' + [...changed].join(', '),
    'Include consumers and both endpoints of registered handoffs',
    ...(generated.length ? ['Generated workers match their unchanged generator; Node and PWA checks still run'] : []),
  ]};
}

export function git(args, cwd = ROOT){ return execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}); }
const lines = text => text.split('\0').filter(Boolean);
export function changedPaths({base = 'origin/main', head = 'HEAD', local = true, cwd = ROOT} = {}){
  const mergeBase = git(['merge-base', '--', base, head], cwd).trim();
  const files = lines(git(['diff','--name-only','--no-renames','-z',mergeBase,head,'--'], cwd));
  if(local){
    // Staged and unstaged edits can cancel in `diff HEAD`; both revisions
    // still need selection (and CI will test the committed result).
    files.push(...lines(git(['diff','--cached','--name-only','--no-renames','-z','--'], cwd)));
    files.push(...lines(git(['diff','--name-only','--no-renames','-z','--'], cwd)));
    files.push(...lines(git(['ls-files','--others','--exclude-standard','-z'], cwd)));
  }
  return [...new Set(files)];
}

export function repositoryPlan(options = {}){
  const files = changedPaths(options);
  const deleted = files.filter(file => !existsSync(join(ROOT, file)));
  if(deleted.length) return planChanges(files, {deleted});
  const tracked = lines(git(['ls-files','-z']));
  const sources = [...new Set([...tracked, ...files])].filter(file => !file.startsWith('dev/') && /\.(js|mjs|html|css)$/.test(file) &&
    !file.includes('/tests/') && !file.endsWith('.test.js') && !file.includes('/vendor/'))
    .map(file => [file, readFileSync(join(ROOT, file), 'utf8')]);
  const graph = dependencyEdges(sources);
  const generated = [];
  if(files.some(file => ['home/sw.js','energy/sw.js'].includes(file)) &&
      !files.some(file => ['dev/gen-sw.mjs','dev/sw-release.mjs'].includes(file))){
    for(const worker of workers())
      if(files.includes(worker.file) && readFileSync(join(ROOT, worker.file), 'utf8') === worker.source)
        generated.push(worker.file);
  }
  return planChanges(files, {...graph, generated});
}

export function toolPlan(names){
  const tools = names.map(toolId);
  const suites = SUITES.filter(s => SUITE_TOOLS[s]?.some(t => tools.includes(t)));
  return {mode:'focused', files:[], tools, suites, reasons:['Explicit local tool selection; not a complete change-impact check']};
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const args = process.argv.slice(2), options = {};
  for(let i=0;i<args.length;i++){
    if(['--base','--head'].includes(args[i]) && (!args[i+1] || args[i+1].startsWith('--'))) throw new Error('Missing ref for ' + args[i]);
    if(args[i] === '--base') options.base = args[++i];
    else if(args[i] === '--head'){ options.head = args[++i]; options.local = false; }
    else if(args[i] !== '--json') throw new Error('Unknown option: ' + args[i]);
  }
  const plan = repositoryPlan(options);
  console.log(args.includes('--json') ? JSON.stringify(plan) : JSON.stringify(plan, null, 2));
}
