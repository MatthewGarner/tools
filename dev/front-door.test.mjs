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
import {SKETCHES} from './front-door-art.mjs';
import {STATS} from './front-door-stats.mjs';

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
  assert.equal(by('model').length, 24, '19 models plus the 5 Energy tools');
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

test('every current entry is staged: one card, one Open link, so one click from /', () => {
  for (const tool of current) {
    const open = hrefs.filter(h => h === toolHref(tool)).length;
    assert.equal(open, 2, `${tool.id}: its art link and its Open link, and nothing else, point at ${toolHref(tool)}`);
    assert.ok(page.includes(`<a class="door-open" href="${toolHref(tool)}">Open ${tool.title.replace(/&/g, '&amp;')}</a>`), `${tool.id} has an "Open <name>" link`);
  }
  assert.equal([...page.matchAll(/<li class="door-card"/g)].length, current.length);
});

test('the four classes hold 15 / 19 / 7 / 5 cards, in the catalogue\'s order, instruments grouped by job with the flagship first', () => {
  const sections = Object.fromEntries([...page.matchAll(/<section class="door-class" id="(\w+)"[\s\S]*?<\/section>/g)].map(m => [m[1], [...m[0].matchAll(/<li class="door-card" data-id="([^"]+)"/g)].map(x => x[1])]));
  assert.deepEqual(Object.keys(sections), ['instruments', 'models', 'workbenches', 'energy']);
  assert.deepEqual(Object.values(sections).map(l => l.length), [15, 19, 7, 5]);
  assert.deepEqual(sections.instruments, Object.values(JOBS).flatMap(j => j.order));
  assert.deepEqual(sections.models.slice(0, 6), ['product:flow', 'product:alarm', 'lab:context', 'lab:commitment', 'lab:teams', 'lab:delay'].sort((a, b) => current.find(t => t.id === a).featured - current.find(t => t.id === b).featured));
  assert.deepEqual(new Set(sections.energy), new Set(current.filter(t => t.source === 'energy').map(t => t.id)));
  assert.equal(new Set(Object.values(sections).flat()).size, current.length, 'every active entry exactly once');
});

test('every active catalogue entry has a sketch and all three stats; the stats stay out of the catalogue', () => {
  for (const tool of current) {
    assert.ok(SKETCHES[tool.route], `${tool.id} has a sketch`);
    const s = STATS[tool.id];
    assert.ok(s, `${tool.id} has stats`);
    assert.ok(typeof s.leaveWith === 'string' && s.leaveWith.trim().split(/\s+/).length <= 5, `${tool.id} leaveWith is at most five words`);
    assert.ok([1, 2, 3].includes(s.time) && [1, 2, 3].includes(s.players), `${tool.id} time and players are 1-3`);
    assert.ok(!('leaveWith' in tool), `${tool.id}: stats are generation-time only`);
  }
  assert.equal(new Set(current.map(t => STATS[t.id].leaveWith)).size, current.length, 'every line is different');
  assert.deepEqual(Object.keys(STATS).filter(id => !current.some(t => t.id === id)), [], 'no stats for a tool that is not active');
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

test('the drawings are 160x100 critters painted with the seven page tokens only, in the page and in the art module', () => {
  const allowed = new Set(['ink', 'paper', 'surface', 'muted', 'line', 'accent', 'data']);
  for (const tool of current) {
    const art = SKETCHES[tool.route];
    for (const [, name] of art.matchAll(/var\(--([\w-]+)\)/g)) assert.ok(allowed.has(name), `${tool.route} paints with --${name}`);
    assert.ok(art.includes('var(--accent)'), `${tool.route} has an accent-coloured protagonist`);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|font-family/i.test(art), `${tool.route} carries no literal colour or font`);
  }
  assert.equal([...page.matchAll(/<svg class="sketch"[^>]*viewBox="0 0 160 100"/g)].length, current.length, 'every card carries a 160x100 drawing');
  assert.ok(!/viewBox="0 0 120 44"/.test(page), 'no thin-line diagram is left');
});

test('Scene-first invention: the spotlight reads as light, not as a paper-coloured shadow', () => {
  const cone = SKETCHES.scenes.match(/<path d="M136 12L80 89h42z"[^>]*>/)?.[0] ?? '';
  assert.ok(cone && !cone.includes('var(--paper)'), cone);
});

test('the front-door styles scope the critter tokens to the drawings; arrival slides on wide screens and follows the scroll on phones', () => {
  const css = readFileSync(ROOT + 'assets/front-door.css', 'utf8'), js = readFileSync(ROOT + 'assets/front-door-device.js', 'utf8');
  assert.ok(/\.door svg\.sketch\s*\{[^}]*--accent:\s*var\(--mg-accent\)/.test(css), 'critter tokens map to the identity palette');
  assert.ok(!css.includes('--sketch-line') && !css.includes('door-draw') && !css.includes('@keyframes door-fade'), 'old sketch machinery is gone');
  assert.ok(!css.includes('door-hop'), 'the post-landing hop is gone (it read as a jump on phones)');
  assert.ok(css.includes('@keyframes door-slide') && /animation-timeline:\s*view\(inline\)/.test(css) && css.includes('@keyframes door-parallax'), 'wide screens slide, phones use a scroll-driven parallax');
  assert.ok(/\.door-art\s*\{\s*overflow:\s*clip;/.test(css), 'the art clips without becoming a scroller');
  assert.ok(!js.includes('pathLength'), 'no stroke-dash injection');
});
