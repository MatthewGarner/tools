import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TYPOGRAPHIES, FONT_FACES, resolveTypography, fontFaceCSS, embedFontCSS} from '../chapter-fonts.js';
import {createChapterFontLoader} from '../chapter-font-loader.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>';

test('typography selection changes headings and retains the bundled body family', () => {
  assert.deepEqual(Object.keys(TYPOGRAPHIES), ['Chapter', 'DM Sans']);
  assert.deepEqual(resolveTypography(), {body: 'DM Sans', display: 'Instrument Serif', displayWeight: 400});
  assert.deepEqual(resolveTypography({font: 'DM Sans'}), {body: 'DM Sans', display: 'DM Sans', displayWeight: 700});
  assert.equal(resolveTypography({font: 'Unknown'}), TYPOGRAPHIES.Chapter);
  assert.equal(resolveTypography({font: '__proto__'}), TYPOGRAPHIES.Chapter);
});

test('all local faces are actual WOFF2 with complete variable weight and licensed subsets', async () => {
  for (const face of FONT_FACES) {
    const data = await readFile(new URL(`../fonts/${face.file}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'wOF2', face.file);
    assert.equal(data.readUInt32BE(8), data.length, `${face.file} declared size`);
  }
  assert.ok(FONT_FACES.filter(f => f.family === 'DM Sans').every(f => f.weight === '100 1000'));
  for (const name of ['DM-Sans', 'Instrument-Serif']) {
    const license = await readFile(new URL(`../fonts/OFL-${name}.txt`, import.meta.url), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
  }
  const css = fontFaceCSS();
  assert.doesNotMatch(css, /https?:/);
  assert.match(css, /unicode-range:U\+0100-02BA/);
});

function environment({fail = false} = {}) {
  const added = [];
  let fetches = 0;
  class Face {
    constructor(family, data, descriptors) { Object.assign(this, {family, data, descriptors}); }
    async load() { this.status = 'loaded'; return this; }
  }
  return {added, get fetches() {return fetches;}, fail,
    FontFace: Face, fonts: {add(face) {assert.equal(face.status, 'loaded'); added.push(face);}},
    async fetch() {
      fetches++;
      return {ok: !this.fail, status: this.fail ? 503 : 200,
        arrayBuffer: async () => new TextEncoder().encode('wOF2example').buffer};
    },
  };
}

// Mutation witness: removing the embed readiness guard must fail the first throws
// assertion, before the stub fetch can complete. This guards explicit failure over
// silently exporting fallback typography while a font request is pending.
test('export refuses unready fonts; successful load embeds every face synchronously and only once', async () => {
  const env = environment();
  const loader = createChapterFontLoader({...env, fetch: env.fetch.bind(env)});
  assert.equal(loader.ready(), false);
  assert.throws(() => loader.embed(svg), /not ready/);
  const pending = loader.load();
  assert.equal(loader.load(), pending);
  assert.throws(() => loader.embed(svg), /not ready/);
  await pending;
  assert.equal(loader.ready(), true);
  assert.equal(env.added.length, FONT_FACES.length);
  assert.equal(env.fetches, FONT_FACES.length);
  const exported = loader.embed(svg);
  assert.equal((exported.match(/data:font\/woff2;base64,/g) || []).length, FONT_FACES.length);
  assert.match(exported, /<text>Hello<\/text>/);
  assert.doesNotMatch(exported, /https?:\/\/(?!www.w3.org)|\.\/fonts\//);
  assert.equal(loader.embed(exported), exported);
});

test('font HTTP failures remain explicit, add no partial font set, and allow a subsequent retry', async () => {
  const env = environment({fail: true});
  const loader = createChapterFontLoader({...env, fetch: env.fetch.bind(env)});
  await assert.rejects(loader.load(), /HTTP 503/);
  assert.equal(loader.ready(), false);
  assert.equal(env.added.length, 0);
  assert.throws(() => loader.embed(svg), /not ready/);
  env.fail = false;
  await loader.load();
  assert.equal(loader.ready(), true);
});

test('embedding accepts XML SVG documents and rejects non-SVG input', () => {
  assert.match(embedFontCSS(`<?xml version="1.0"?>${svg}`, 'test'), /<svg[^>]*><style/);
  assert.throws(() => embedFontCSS('<div>not SVG</div>', 'test'), /expected an SVG/);
});
