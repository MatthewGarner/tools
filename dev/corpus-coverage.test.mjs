/* Coverage guards for the four hand-maintained test corpora. These assertions
   deliberately compare named members, not counts: a newly eligible tool must be
   covered or added to a reasoned allowlist, and removed coverage cannot be hidden
   by an unrelated addition. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, normalize, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const sorted = xs => [...xs].sort();
const toolFiles = file => [
  ...TOOL_DIRS.map(tool => ({tool, rel: tool + '/' + file})),
  ...ENERGY_TOOL_DIRS.map(tool => ({tool, rel: 'energy/' + tool + '/' + file})),
].filter(({rel}) => {
  try { return statSync(join(ROOT, rel)).isFile(); }
  catch { return false; }
});

function assertReasonedPartition({eligible, covered, allowed, label}){
  const eligibleSet = new Set(eligible);
  const coveredSet = new Set(covered);
  const allowedSet = new Set(Object.keys(allowed));
  const unreasoned = [...allowedSet].filter(tool =>
    typeof allowed[tool] !== 'string' || allowed[tool].trim().length < 12);
  assert.deepEqual(unreasoned, [], label + ': allowlist entries need a specific reason');
  assert.deepEqual(sorted([...coveredSet].filter(tool => !eligibleSet.has(tool))), [],
    label + ': corpus names tools that are no longer eligible');
  assert.deepEqual(sorted([...allowedSet].filter(tool => !eligibleSet.has(tool))), [],
    label + ': stale allowlist entries name tools that are no longer eligible');
  assert.deepEqual(sorted([...allowedSet].filter(tool => coveredSet.has(tool))), [],
    label + ': stale allowlist entries are now covered and must be removed');
  assert.deepEqual(sorted([...eligibleSet].filter(tool => !coveredSet.has(tool) && !allowedSet.has(tool))), [],
    label + ': eligible tools are neither covered nor explicitly allowed');
}

test('motion-spec selector corpus covers every authored motion spec', () => {
  const eligible = toolFiles('motion-spec.js').map(({tool}) => tool);
  const src = read('dev/motion-spec.test.mjs');
  const covered = [...src.matchAll(/\{tool:\s*['"]([^'"]+)['"],\s*spec:/g)].map(m => m[1]);
  assert.ok(eligible.length > 0, 'motion-spec discovery found nothing');
  assert.deepEqual(sorted(covered), sorted(eligible),
    'dev/motion-spec.test.mjs SPECS must name every motion-spec.js exactly once');
  assert.equal(new Set(covered).size, covered.length, 'motion-spec SPECS contains duplicate tools');
});

test('motion browser rollout covers every mountMotion app or explicitly deep-tests it', () => {
  const eligible = toolFiles('app.js')
    .filter(({rel}) => /\bmountMotion\s*\(/.test(read(rel)))
    .map(({tool}) => tool);
  const src = read('dev/pw/motion.mjs');
  const body = src.match(/const ROLLOUT\s*=\s*\[([\s\S]*?)\n\];/)?.[1] || '';
  const covered = [...body.matchAll(/\[\s*['"]([^'"]+)['"]\s*,/g)].map(m => m[1]);
  const allowed = {
    alarm: 'The draw-showcase block above ROLLOUT exercises alarm reveal and cleanup.',
    flow: 'The draw-showcase and below-fold blocks above ROLLOUT deeply exercise flow.',
    'merit-order': 'The dedicated merit-order block exercises reveal plus FLIP settle.',
    timeline: 'The dedicated timeline block exercises reveal and no replay on theme change.',
  };
  assert.ok(body, 'could not locate motion.mjs ROLLOUT');
  assert.equal(new Set(covered).size, covered.length, 'motion ROLLOUT contains duplicate tools');
  assertReasonedPartition({eligible, covered, allowed, label: 'motion ROLLOUT'});
});

function renderersOnDisk(){
  const out = [];
  for(const top of readdirSync(ROOT)){
    const topPath = join(ROOT, top);
    if(top.startsWith('.') || ['node_modules', 'vendor'].includes(top) || !statSync(topPath).isDirectory()) continue;
    for(const file of readdirSync(topPath))
      if(/^render.*\.js$/.test(file)) out.push(top + '/' + file);
    if(top === 'energy') for(const sub of readdirSync(topPath)){
      const subPath = join(topPath, sub);
      if(!statSync(subPath).isDirectory()) continue;
      for(const file of readdirSync(subPath))
        if(/^render.*\.js$/.test(file)) out.push('energy/' + sub + '/' + file);
    }
  }
  return sorted(out);
}

const importRefs = src => [...src.matchAll(/(?:import\(|from\s+)\s*['"]([^'"]+\.js)['"]/g)].map(m => m[1]);
const repoRel = abs => normalize(relative(ROOT, abs)).split(sep).join('/');
function reachableModules(entry){
  const seen = new Set();
  const visit = rel => {
    rel = repoRel(resolve(ROOT, rel));
    if(seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel);
    for(const ref of importRefs(src)) if(ref.startsWith('.')){
      const target = repoRel(resolve(ROOT, dirname(rel), ref));
      if(target.endsWith('.js') || target.endsWith('.mjs')) visit(target);
    }
  };
  visit(entry);
  return seen;
}

test('golden corpus reaches every SVG renderer or explicitly excludes HTML-only renderers', () => {
  const eligible = renderersOnDisk();
  const covered = [...reachableModules('dev/golden.mjs')].filter(rel => eligible.includes(rel));
  const allowed = {
    'duel/render.js': 'HTML interaction renderer; exact SVG golden files cannot represent its output.',
    'gauge/render-form.js': 'HTML questionnaire renderer; the gauge SVG overlay renderer is golden-covered.',
    'premortem/render-board.js': 'HTML workshop board renderer; it does not emit an SVG artefact.',
    'premortem/render-register.js': 'HTML workshop register renderer; it does not emit an SVG artefact.',
    'premortem/render-wizard.js': 'HTML wizard renderer; it does not emit an SVG artefact.',
  };
  assert.ok(eligible.length > 0, 'renderer discovery found nothing');
  assertReasonedPartition({eligible, covered, allowed, label: 'golden renderer corpus'});
});

/* Read actual page.goto arguments rather than trusting a second hand-written tool
   list. This small scanner only needs balanced parentheses and quoted strings; it
   intentionally ignores comments outside a goto call. */
function gotoArguments(src){
  const out = [];
  for(let at = src.indexOf('.goto('); at >= 0; at = src.indexOf('.goto(', at + 1)){
    let i = at + 6, depth = 1, quote = '', escaped = false;
    for(; i < src.length && depth; i++){
      const ch = src[i];
      if(quote){
        if(escaped) escaped = false;
        else if(ch === '\\') escaped = true;
        else if(ch === quote) quote = '';
      } else if(ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if(ch === '(') depth++;
      else if(ch === ')') depth--;
    }
    if(depth === 0) out.push(src.slice(at + 6, i - 1));
  }
  return out;
}

function routesIn(text){
  const out = [];
  for(const m of text.matchAll(/['"]\/(?:energy\/)?([a-z0-9-]+)\/(?:#|['"])/g)) out.push(m[1]);
  return out;
}

test('check-eip visits every attachEditInPlace tool or records its dedicated-suite witness', () => {
  const eligible = toolFiles('app.js')
    .filter(({rel}) => /import\s*\{[^}]*\battachEditInPlace\b[^}]*\}\s*from/.test(read(rel)))
    .map(({tool}) => tool);
  const src = read('dev/pw/check-eip.mjs');
  const baseRoute = routesIn(src.match(/const BASE\s*=.*?;\s*$/m)?.[0] || '');
  const covered = new Set([...baseRoute, ...gotoArguments(src).flatMap(routesIn)]);
  const allowed = {
    case: 'dev/pw/case.mjs owns case-level edit-in-place interaction and undo coverage.',
    proxy: 'dev/pw/smoke.mjs exercises the proxy author-verdict edit-in-place flow in both themes.',
  };
  assert.ok(eligible.length > 0, 'edit-in-place app discovery found nothing');
  assertReasonedPartition({eligible, covered, allowed, label: 'check-eip tool corpus'});
});
