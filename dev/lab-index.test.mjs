/* The Lab index and the Lab's names. lab/dist is hand-maintained source (and the source of the
   separately packaged legacy Lab site), so nothing generates the index's cards: this test is what
   stops a catalogue entry from being silently absent, as six models were until 2026-11. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {experiments} from '../lab/dist/shared/catalog.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');
const index = read('lab/dist/index.html');
const card = id => index.match(new RegExp('<a ([^>]*)data-id="' + id + '"([^>]*)>'));
const isCurrent = e => !e.status || e.status === 'active';

test('every current catalogue entry has a visible card on the Lab index, linking to its own page', () => {
  for(const e of experiments.filter(isCurrent)){
    const m = card(e.id);
    assert.ok(m, `${e.id} ${e.route} has no card on lab/dist/index.html`);
    const attrs = m[1] + m[2];
    assert.doesNotMatch(attrs, /\bhidden\b/, `${e.route}: a current entry must not be hidden`);
    assert.match(attrs, new RegExp('href="' + e.route + '/"'), `${e.route}: card href`);
    assert.match(attrs, new RegExp('data-kind="' + e.kind + '"'), `${e.route}: card kind`);
    assert.ok(index.includes(`<h3>${e.title} `), `${e.route}: card carries the catalogue title`);
  }
});

test('every archived or merged entry has a card, hidden until the Archive tab', () => {
  for(const e of experiments.filter(e => !isCurrent(e))){
    const m = card(e.id);
    assert.ok(m, `${e.id} ${e.route} (archived) has no card`);
    assert.match(m[1] + m[2], /\bhidden\b/, `${e.route}: archived cards start hidden`);
  }
});

test('the index has exactly one card per catalogue entry, and no card the catalogue lacks', () => {
  const ids = [...index.matchAll(/<a [^>]*data-id="([A-Z]\d+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), experiments.map(e => e.id).sort());
});

test('counts on the index are computed from the catalogue, never typed', () => {
  const head = index.match(/<head>[\s\S]*?<\/head>/)[0], intro = index.match(/<section class="gallery-intro">[\s\S]*?<\/section>/)[0];
  const filters = index.match(/<div class="filters"[\s\S]*?<\/div>/)[0], count = index.match(/<p id="count"[^>]*>[^<]*<\/p>/)[0];
  for(const [name, text] of [['meta description', head.match(/name="description" content="([^"]*)"/)[1]], ['intro', intro.replace(/<[^>]+>/g, ' ')], ['filters', filters.replace(/<[^>]+>/g, ' ')], ['count', count.replace(/<[^>]+>/g, ' ')]])
    assert.doesNotMatch(text, /\d/, `${name} has a typed number: ${text.trim()}`);
  const js = read('lab/dist/gallery.js');
  assert.match(js, /note-small/, 'gallery.js writes the intro counts from the catalogue');
});

test('the index names itself Models and workbenches, and keeps no old name as a title', () => {
  assert.match(index, /<title>Tools Lab · Models and workbenches<\/title>/);
  assert.match(index, /<h1>Models and workbenches<\/h1>/);
  for(const old of ['THE THINKING BENCH', 'The thinking bench', 'A bench of models and thinking tools', 'Thinking Lab'])
    assert.ok(!index.includes(old), `retired name still on the index: ${old}`);
  assert.ok(index.includes('What happens if you change this?'), 'the question stays as a supporting line');
});

const files = (dir, out = []) => {
  for(const f of readdirSync(join(ROOT, dir))){
    const rel = dir + '/' + f;
    if(statSync(join(ROOT, rel)).isDirectory()) files(rel, out);
    else if(/\.(html|js|css)$/.test(f) && !/\.test\.js$/.test(f)) out.push(rel);
  }
  return out;
};

/* Each of these sits in a module of a PUBLISHED article-embed definition (dev/embed-catalogue.mjs
   refuses to replace a published version), so its words change only with a new definition version. */
const FROZEN = {
  'lab/dist/mixer/model.js': 'lab-mixer: the footer of the Markdown export',
  'lab/dist/reframe/state.js': 'lab-reframe: the footer of the Markdown export',
  'lab/dist/teams/library.js': 'lab-teams: the message shown for a file that is not a Teams export',
};

test('every Lab page title ends "· Tools Lab", and no human-visible "Thinking Lab" remains in lab/dist', () => {
  for(const e of experiments){
    const title = read(`lab/dist/${e.route}/index.html`).match(/<title>([^<]*)<\/title>/)[1];
    assert.match(title, /^.+ · Tools Lab$/, `${e.route}: ${title}`);
  }
  assert.match(read('lab/dist/about.html').match(/<title>([^<]*)<\/title>/)[1], /^About the experiments · Tools Lab$/);
  // Identifiers use the hyphenated "thinking-lab" (storage keys, formats, the hostname); prose never says "Thinking Lab".
  const found = files('lab/dist').filter(f => /Thinking Lab/.test(read(f)));
  assert.deepEqual(found, Object.keys(FROZEN), 'prose naming the old product in: ' + found.join(', '));
});
