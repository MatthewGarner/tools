import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');

const STANDARD = {
  'alarm/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'bets/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'case/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'energy/cycles/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'energy/frequency/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'energy/intraday/index.html': ['copypng', 'dlpng', 'dlsvg'],
  'energy/merit-order/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'energy/risk/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'flow/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'gauge/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'map/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'roadmap/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'signal-vs-noise/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'timeline/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'tree/index.html': ['copypng', 'dlpng', 'dlsvg'],
  'wardley/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'why/index.html': ['copypng', 'dlpng', 'dlsvg'],
};

function assertExportDisclosure(html, who, [copyId, ...secondary]){
  const copyAt = html.indexOf(`id="${copyId}"`);
  assert.notEqual(copyAt, -1, `${who}: missing visible ${copyId}`);
  const detailAt = html.indexOf('<details class="action-disclosure">', copyAt);
  const summaryAt = html.indexOf('<summary class="btn">Export</summary>', copyAt);
  const endAt = html.indexOf('</details>', summaryAt);
  assert.ok(copyAt < detailAt && detailAt < summaryAt && summaryAt < endAt,
    `${who}: Copy PNG must precede a native Export disclosure`);
  for(const id of secondary){
    const at = html.indexOf(`id="${id}"`, summaryAt);
    assert.ok(at > summaryAt && at < endAt, `${who}: ${id} is not inside Export`);
  }
}

test('instrument export rows keep Copy PNG immediate and disclose secondary formats', () => {
  for(const [path, ids] of Object.entries(STANDARD))
    assertExportDisclosure(read(path), path, ids);

  /* Multi-surface tools retain their own action rows, but use the same hierarchy
     wherever that surface actually offers Copy PNG plus secondary downloads. */
  const special = [
    ['flow/index.html', ['copybatchpng', 'dlbatchpng', 'dlbatchsvg']],
    ['flow/index.html', ['copytriagepng', 'dltriagepng', 'dltriagesvg']],
    ['gauge/index.html', ['copypng2', 'copymd2', 'dlpng2', 'dlsvg2']],
    ['fermi/index.html', ['cfcopypng', 'cfcopydoc', 'cfpng', 'cfsvg']],
  ];
  for(const [path, ids] of special) assertExportDisclosure(read(path), path, ids);
});

test('snapshot controls live together in a native History disclosure', () => {
  for(const path of ['bets/index.html', 'map/index.html', 'roadmap/index.html',
    'timeline/index.html', 'wardley/index.html', 'why/index.html']){
    const html = read(path);
    const summaryAt = html.indexOf('<summary class="btn">History</summary>');
    const endAt = html.indexOf('</details>', summaryAt);
    assert.ok(summaryAt >= 0 && endAt > summaryAt, `${path}: missing History disclosure`);
    for(const id of ['snap', 'snapsel', 'snapdel']){
      const at = html.indexOf(`id="${id}"`, summaryAt);
      assert.ok(at > summaryAt && at < endAt, `${path}: ${id} is not inside History`);
    }
  }
});
