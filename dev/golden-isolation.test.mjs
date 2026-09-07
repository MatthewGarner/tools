import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const harness = fileURLToPath(new URL('./golden.mjs', import.meta.url));
const chapter = new URL('../roadmap/chapter-svg.js', import.meta.url).href;
const fault = 'injected Chapter renderer failure';
const run = (args, {source, now} = {}) => {
  const flags = [];
  if(now){
    flags.push('--import', 'data:text/javascript,' + encodeURIComponent(`
      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args){ super(...(args.length ? args : [${JSON.stringify(now)}])); }
        static now(){ return OriginalDate.parse(${JSON.stringify(now)}); }
      };
    `));
  }
  if(source){
    // Inject only into the child process: never mutate a renderer shared with
    // another test or developer. Both import and render failures are real faults.
    const loader = 'data:text/javascript,' + encodeURIComponent(`
      export async function load(url, context, nextLoad){
        if(url === ${JSON.stringify(chapter)}) return {
          format: 'module', shortCircuit: true, source: ${JSON.stringify(source)}
        };
        return nextLoad(url, context);
      }
    `);
    flags.push('--import', 'data:text/javascript,' + encodeURIComponent(
      `import {register} from 'node:module'; register(${JSON.stringify(loader)});`));
  }
  return spawnSync(process.execPath, [...flags, harness, ...args], {encoding: 'utf8'});
};

for(const phase of ['import', 'render']){
  test(`focused goldens survive an unrelated renderer ${phase} failure`, () => {
    const source = `
      ${phase === 'import' ? `throw new Error(${JSON.stringify(fault)});` : ''}
      export function renderChapter(){ throw new Error(${JSON.stringify(fault)}); }
      export function renderChapterPages(){ throw new Error(${JSON.stringify(fault)}); }
    `;
    const affected = run(['compare', 'chapter'], {source});
    assert.notEqual(affected.status, 0, 'the selected renderer must expose the injected fault');
    assert.match(affected.stderr, new RegExp(fault));

    const unrelated = run(['compare', 'alarm'], {source});
    assert.equal(unrelated.status, 0, unrelated.stderr);
    assert.equal(unrelated.stdout.trim(), 'IDENTICAL alarm-dist');
  });
}

test('a narrower hyphen prefix compares only matching fixtures', () => {
  const result = run(['compare', 'chapter-grid-light']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'IDENTICAL chapter-grid-light-slide-0',
    'IDENTICAL chapter-grid-light-slide-1',
  ]);
});

test('Chapter calendar fixtures remain identical after the wall clock advances', () => {
  const result = run(['compare', 'chapter'], {now: '2040-01-01T00:00:00Z'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^IDENTICAL chapter-spans$/m);
});

for(const prefix of ['nonexistent', 'chapter-nonexistent']){
  test(`a prefix with no fixtures fails clearly: ${prefix}`, () => {
    const result = run(['compare', prefix]);
    assert.notEqual(result.status, 0, 'an empty comparison must not pass');
    assert.match(result.stderr, /no golden fixtures match/i);
    assert.equal(result.stdout, '');
  });
}

test('invalid commands fail before rendering', () => {
  const result = run(['comapre', 'alarm']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage:/i);
  assert.equal(result.stdout, '');
});
