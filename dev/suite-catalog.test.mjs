import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TOOL_DIRS, ENERGY_TOOL_DIRS } from './tool-dirs.mjs';
import { experiments } from '../lab/dist/shared/catalog.js';
import { SUITE_CATALOG, filterCatalog, filtersToSearch, normaliseText, parseFilters, toolHref } from '../assets/suite-catalog.js';

test('catalogue represents every existing tool once, with stable routes and separate type and maturity', () => {
  assert.equal(new Set(SUITE_CATALOG.map(t => t.id)).size, SUITE_CATALOG.length);
  assert.equal(new Set(SUITE_CATALOG.map(t => toolHref(t))).size, SUITE_CATALOG.length);
  for (const [source, routes] of [['product', TOOL_DIRS], ['energy', ENERGY_TOOL_DIRS], ['lab', experiments.map(t => t.route)]]) {
    assert.deepEqual(SUITE_CATALOG.filter(t => t.source === source).map(t => t.route).sort(), [...routes].sort());
  }
  for (const tool of SUITE_CATALOG) {
    assert.match(tool.id, /^(product|energy|lab):[a-z][a-z-]*$/);
    assert.ok(tool.type && tool.maturity && tool.domains.length);
    const folder = tool.source === 'lab' ? 'lab/dist/' : tool.source === 'energy' ? 'energy/' : '';
    assert.ok(fs.existsSync(new URL(`../${folder}${tool.route}/index.html`, import.meta.url)), `Page exists: ${tool.id}`);
  }
});

test('active results exclude archives; archive discovery retains merged identities and destinations', () => {
  const active = filterCatalog();
  const archived = filterCatalog({ maturity: 'archived' });
  assert.equal(active.length + archived.length, SUITE_CATALOG.length);
  assert.ok(active.every(t => t.status === 'active'));
  for (const original of experiments.filter(t => t.status)) {
    const entry = archived.find(t => t.route === original.route);
    assert.equal(entry.status, original.status);
    assert.equal(entry.mergedInto, original.mergedInto);
    assert.equal(entry.archiveReason, original.archiveReason);
  }
  assert.ok(filterCatalog({ domain: 'energy' }).some(t => t.id === 'lab:flexibility'));
  assert.ok(filterCatalog({ domain: 'energy', maturity: 'experimental' }).some(t => t.id === 'lab:accuracy'));
});

test('search is case and accent insensitive, combines words, and composes with domain/type/maturity', () => {
  assert.equal(normaliseText('ÉNERGY’s'), "energy's");
  assert.deepEqual(filterCatalog({ q: 'BÁTTÉRY' }), filterCatalog({ q: 'battery' }));
  assert.deepEqual(filterCatalog({ q: 'BATTERY warranty' }).map(t => t.id), ['energy:cycles']);
  assert.deepEqual(filterCatalog({ q: 'battery', domain: 'product' }).map(t=>t.id), ['lab:accuracy']);
  assert.deepEqual(filterCatalog({ q: 'battery', type: 'calculator' }).map(t => t.id), ['energy:cycles']);
  assert.ok(filterCatalog({ maturity: 'established' }).every(t => t.source !== 'lab'));
  assert.equal(filterCatalog({ q: '    ' }).length, filterCatalog().length);
  assert.equal(filterCatalog({ q: '<img src=x onerror=alert(1)>' }).length, 0);
});

test('shareable filters validate unknown values, retain unrelated query data, and round-trip Unicode safely', () => {
  assert.deepEqual(parseFilters('?domain=unknown&type=__proto__&maturity=merged'), { q: '', domain: '', type: '', maturity: '' });
  const filters = { q: 'café & batteries', domain: 'energy', type: 'model', maturity: 'experimental' };
  assert.deepEqual(parseFilters(filtersToSearch(filters)), filters);
  const params = new URLSearchParams(filtersToSearch({ q: '' }, '?q=old&domain=lab&from=bookmark'));
  assert.equal(params.get('from'), 'bookmark');
  assert.equal(params.has('q'), false);
  assert.equal(params.has('domain'), false);
  assert.equal(parseFilters(`?q=${'a'.repeat(300)}`).q.length, 200);
});

test('Energy links respect its established host while local and preview browsing stays on origin', () => {
  const energy = SUITE_CATALOG.find(t => t.id === 'energy:risk');
  const lab = SUITE_CATALOG.find(t => t.id === 'lab:flexibility');
  const product = SUITE_CATALOG.find(t => t.id === 'product:roadmap');
  assert.equal(toolHref(energy, 'energy.matthewgarner.me'), '/risk/');
  for (const host of ['localhost', '127.0.0.1', 'preview.vercel.app', 'tools.matthewgarner.me']) assert.equal(toolHref(energy, host), '/energy/risk/');
  assert.equal(toolHref(lab, 'energy.matthewgarner.me'), '/lab/flexibility/');
  assert.equal(toolHref(product, 'energy.matthewgarner.me'), '/roadmap/');
});

test('static no-JS catalogue and the Lab metadata snapshot stay current', () => {
  execFileSync(process.execPath, ['dev/generate-catalogue.mjs', '--check'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  const html = fs.readFileSync(new URL('../explore/index.html', import.meta.url), 'utf8');
  for (const tool of SUITE_CATALOG) assert.ok(html.includes(`data-catalog-id="${tool.id}"`));
  assert.match(html, /<details[^>]*data-archive-list>/);
  assert.doesNotMatch(html, /<li[^>]*hidden/);
});
