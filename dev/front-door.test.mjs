/* The front door at `/` is generated from the catalogue, so the contract worth
   pinning is data and routing, not markup: every entry has a room, the featured
   set is capped, a catalogue title is the page's own name, every current entry is
   at most one click from `/`, and the routes that make `/` the front door and
   `/product/` a redirect exist in vercel.json AND in the local server. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {SUITE_CATALOG, ROOMS, JOBS, filterCatalog, parseFilters, toolHref} from '../assets/suite-catalog.js';
import {SHELL_MANIFEST} from './shell-manifest.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));
const current = SUITE_CATALOG.filter(t => t.maturity !== 'archived');
const page = readFileSync(ROOT + 'home/index.html', 'utf8');

test('every catalogue entry has a room, instruments have a job, and the job table agrees', () => {
  for (const tool of SUITE_CATALOG) {
    assert.ok(Object.hasOwn(ROOMS, tool.room), `${tool.id} room ${tool.room}`);
    if (tool.room === 'instrument') assert.ok(Object.hasOwn(JOBS, tool.job), `${tool.id} job ${tool.job}`);
    else assert.equal(tool.job, undefined, `${tool.id} is not an instrument, so it has no job`);
  }
  assert.deepEqual(Object.keys(JOBS), ['size', 'choose', 'plan', 'test', 'case']);
  for (const [job, {order}] of Object.entries(JOBS)) {
    assert.deepEqual(order.map(id => SUITE_CATALOG.find(t => t.id === id)?.job), order.map(() => job), `${job} order lists exactly its tools`);
  }
  const listed = Object.values(JOBS).flatMap(j => j.order);
  assert.deepEqual(SUITE_CATALOG.filter(t => t.room === 'instrument').map(t => t.id).sort(), [...listed].sort());
});

test('rooms hold the right entries: 15 instruments, the 7 current scaffolds as workbenches, the rest models', () => {
  const by = room => current.filter(t => t.room === room);
  assert.equal(by('instrument').length, 15);
  assert.ok(by('instrument').every(t => t.source === 'product'));
  assert.deepEqual(by('workbench').map(t => t.id).sort(), SUITE_CATALOG.filter(t => t.type === 'scaffold' && t.maturity !== 'archived').map(t => t.id).sort());
  assert.equal(by('workbench').length, 7);
  assert.equal(by('model').length, 24);
  assert.ok(['product:alarm', 'product:flow', 'product:signal-vs-noise'].every(id => by('model').some(t => t.id === id)));
  assert.equal(by('model').filter(t => t.source === 'energy').length, 5);
});

test('featured is exactly 5 instruments and 6 models, each numbered once, one flagship per job', () => {
  const featured = room => current.filter(t => t.room === room && t.featured !== undefined);
  assert.equal(featured('instrument').length, 5);
  assert.equal(featured('model').length, 6);
  assert.equal(SUITE_CATALOG.filter(t => t.featured !== undefined && t.room === 'workbench').length, 0);
  for (const room of ['instrument', 'model']) {
    const numbers = featured(room).map(t => t.featured).sort((a, b) => a - b);
    assert.deepEqual(numbers, numbers.map((_, i) => i + 1), `${room} featured numbers run 1..n`);
  }
  assert.deepEqual(featured('instrument').map(t => t.job).sort(), ['case', 'choose', 'plan', 'size', 'test']);
  assert.deepEqual(featured('instrument').sort((a, b) => a.featured - b.featured).map(t => t.route), ['fermi', 'rank', 'roadmap', 'premortem', 'case']);
  assert.deepEqual(featured('model').sort((a, b) => a.featured - b.featured).map(t => t.id),
    ['product:flow', 'product:alarm', 'lab:commitment', 'lab:delay', 'lab:teams', 'lab:context']);
  assert.ok(current.every(t => t.featured === undefined || Number.isInteger(t.featured) && t.featured > 0));
});

test('a catalogue title is that page\'s own name in the shell manifest', () => {
  const nonLab = SUITE_CATALOG.filter(t => t.source !== 'lab');
  assert.equal(nonLab.length, 23);
  for (const tool of nonLab) {
    assert.ok(SHELL_MANIFEST[tool.route], `${tool.id} has a manifest entry`);
    assert.equal(tool.title, SHELL_MANIFEST[tool.route].name, `${tool.id} title vs header name`);
  }
});

/* The links the generated page carries, read back out of the markup. */
const hrefs = [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map(m => m[1]);
const modelsLink = [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"[^>]*>\s*All (\d+) models/g)][0];

test('every current entry is on the page or one click away, behind the filter an "All models" link opens', () => {
  assert.ok(modelsLink, 'the page has an "All N models" link');
  const [, href, n] = modelsLink;
  const url = new URL(href, 'https://tools.example/');
  assert.equal(url.pathname, '/explore/');
  const opened = filterCatalog(parseFilters(url.search));
  assert.equal(Number(n), opened.length, 'N is the size of the list the link opens, not a typed number');
  assert.ok(opened.every(t => t.room === 'model'), 'the models filter opens only models');
  const reachable = new Set(opened.map(t => t.id));
  for (const tool of current) if (hrefs.includes(toolHref(tool))) reachable.add(tool.id);
  assert.deepEqual(current.filter(t => !reachable.has(t.id)).map(t => t.id), [], 'unreachable from /');
  // Everything that is not a model is on the page itself, never behind a filter.
  for (const tool of current.filter(t => t.room !== 'model')) assert.ok(hrefs.includes(toolHref(tool)), `${tool.id} is linked from /`);
});

test('the foot counts every current tool and links to the full catalogue', () => {
  const m = page.match(/<a\b[^>]*\shref="\/explore\/"[^>]*>\s*Search all (\d+) tools/);
  assert.ok(m, 'Search all N tools');
  assert.equal(Number(m[1]), current.length);
});

test('routing: `/` serves the front door, `/product/` redirects to its Instruments, `/explore/` stays', () => {
  const rewrites = vercel.rewrites.filter(r => !r.has);
  assert.deepEqual(rewrites.find(r => r.source === '/'), {source: '/', destination: '/home/'});
  assert.equal(rewrites.some(r => r.source === '/product/'), false, '/product/ is no longer a rewrite');
  for (const source of ['/product', '/product/']) {
    assert.deepEqual(vercel.redirects.filter(r => r.source === source), [{source, destination: '/#instruments', permanent: false}], source);
  }
  assert.equal(rewrites.some(r => r.destination === '/explore/'), false, 'nothing rewrites to /explore/; it is a real directory');
});

async function withServer(fn) {
  const child = spawn(process.execPath, ['dev/serve.mjs', '0'], {cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit']});
  try {
    const port = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', d => { out += d; const m = out.match(/ on (\d+)/); if (m) resolve(Number(m[1])); });
      child.once('exit', code => reject(new Error('serve.mjs exited ' + code)));
    });
    await fn('http://127.0.0.1:' + port);
  } finally { child.kill(); }
}

test('the local server mirrors it: `/` is the front door, `/product/` and `/product` redirect', async () => {
  await withServer(async base => {
    const root = await fetch(base + '/');
    assert.equal(root.status, 200);
    assert.match(await root.text(), /id="instruments"/);
    for (const path of ['/product/', '/product']) {
      const r = await fetch(base + path, {redirect: 'manual'});
      assert.ok([301, 302, 307, 308].includes(r.status), path + ' status ' + r.status);
      assert.equal(r.headers.get('location'), '/#instruments', path);
    }
    assert.equal((await fetch(base + '/explore/')).status, 200);
    assert.match(await (await fetch(base + '/explore/')).text(), /data-explore-form/);
  });
});
