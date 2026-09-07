import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {COMPATIBILITY_MODULES, moduleGraph, moduleReferences} from './module-graph.mjs';

const root = new URL('../', import.meta.url);
const tools = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(dir => 'energy/' + dir)];
const owner = path => tools.find(dir => path.startsWith(dir + '/')) || path.split('/')[0];
const contracts = new Map([
  ['energy/intraday', new Set(['energy/merit-order/model.js', 'energy/merit-order/diagram.js'])],
  ['timeline', new Set(['premortem/links.js'])],
]);

test('current tools depend on shared code or explicit target contracts, never sibling internals', () => {
  const violations = [];
  for(const dir of ['assets', ...tools]){
    for(const entry of readdirSync(new URL(dir + '/', root), {recursive:true})){
      if(!entry.endsWith('.js') || entry.split('/').some(part => part === 'tests' || part === 'vendor')) continue;
      const file = dir + '/' + entry;
      if(COMPATIBILITY_MODULES.includes(file)) continue;
      for(const ref of moduleReferences(file, readFileSync(new URL(file, root), 'utf8'))){
        if(owner(ref) !== owner(file) && owner(ref) !== 'assets' && !contracts.get(owner(file))?.has(ref))
          violations.push(file + ' -> ' + ref);
        if(COMPATIBILITY_MODULES.includes(ref)) violations.push(file + ' -> legacy URL ' + ref);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('Paths and Proxy rendering can load without another tool model', () => {
  for(const dir of ['paths', 'proxy']){
    for(const file of readdirSync(new URL(dir + '/', root)).filter(file => /^render.*\.js$/.test(file))){
      const dependencies = [...moduleGraph(root, dir + '/' + file)];
      assert.deepEqual(dependencies.filter(path => owner(path) !== dir && owner(path) !== 'assets'), [], file);
    }
  }
});

test('old editor and artefact URLs retain the same module identity', async () => {
  const editor = await import('../assets/vendor/codemirror.js');
  const oldEditor = await import('../roadmap/vendor/codemirror.js');
  assert.equal(oldEditor.EditorState, editor.EditorState);
  assert.equal(oldEditor.EditorView, editor.EditorView);
  const parts = await import('../assets/artefact-parts.js');
  const oldParts = await import('../paths/artefact-parts.js');
  assert.equal(oldParts.wrappedArtefactText, parts.wrappedArtefactText);
  const shapes = await import('../assets/svg-shapes.js');
  const oldShapes = await import('../roadmap/deck-parts.js');
  assert.equal(oldShapes.rect, shapes.rect);
  assert.equal(oldShapes.line, shapes.line);
});
