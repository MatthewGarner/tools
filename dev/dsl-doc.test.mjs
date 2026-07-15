/* Meta-test: DSL.md stays true to the real parsers.
   (1) Coverage — every DSL tool (a dir with a parse.js, minus ALLOW) has at least
       one worked example in DSL.md, so a new DSL tool can't ship undocumented.
   (2) Correctness — every fenced ```dsl tool=<name> block parses through that
       tool's REAL parse.js with ZERO warnings. Because each example is written to
       exercise its tool's config keys + signature syntax, a clean parse also proves
       those keys are accepted (an unknown key would warn). No parser-source scraping.
   Self-enforcing, like dev/renderer-coverage.test.mjs / dev/docs.test.mjs. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/* A parse.js that isn't a user-facing DSL section would go here, with a reason. */
const ALLOW = new Set([
  // 'some/tool' — reason required before adding
]);

const isDir = rel => existsSync(join(ROOT, rel)) && statSync(join(ROOT, rel)).isDirectory();

/* Discover DSL tools = dirs (one level, plus energy/<sub>) containing parse.js. */
function discoverDslTools(){
  const out = [];
  for(const top of readdirSync(ROOT)){
    if(top.startsWith('.') || !isDir(top)) continue;
    if(existsSync(join(ROOT, top, 'parse.js'))) out.push(top);
    if(top === 'energy'){
      for(const sub of readdirSync(join(ROOT, top))){
        const rel = top + '/' + sub;
        if(isDir(rel) && existsSync(join(ROOT, rel, 'parse.js'))) out.push(rel);
      }
    }
  }
  return out.filter(t => !ALLOW.has(t)).sort();
}

/* Extract fenced blocks tagged ```dsl tool=<name>. Returns [{tool, body}]. */
function exampleBlocks(md){
  const out = [];
  const re = /```dsl\s+tool=([^\s`]+)\s*\n([\s\S]*?)```/g;
  let m;
  while((m = re.exec(md))) out.push({tool: m[1].trim(), body: m[2].replace(/\n$/, '')});
  return out;
}

const md = readFileSync(join(ROOT, 'DSL.md'), 'utf8');
const tools = discoverDslTools();
const blocks = exampleBlocks(md);
const toolsWithExample = new Set(blocks.map(b => b.tool));

test('every DSL tool on disk has a worked example in DSL.md', () => {
  assert.ok(tools.length > 0, 'discovery found no DSL tools — the walk is broken');
  const missing = tools.filter(t => !toolsWithExample.has(t));
  assert.deepEqual(missing, [], 'DSL tools with no ```dsl tool=<name> example: ' + missing.join(', '));
});

test('every example tag names a real DSL tool', () => {
  const known = new Set(tools);
  const bogus = [...toolsWithExample].filter(t => !known.has(t));
  assert.deepEqual(bogus, [], 'example tags for non-existent tools: ' + bogus.join(', '));
});

for(const {tool, body} of blocks){
  test(`DSL.md example for ${tool} parses with zero warnings`, async () => {
    const {parse} = await import(join(ROOT, tool, 'parse.js'));
    const model = parse(body);
    const warnings = model.warnings || [];
    assert.equal(warnings.length, 0,
      `${tool} example warns:\n  ` +
      warnings.map(w => typeof w === 'string' ? w : (w.line ? `line ${w.line}: ${w.msg}` : JSON.stringify(w))).join('\n  '));
  });
}
