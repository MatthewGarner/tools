import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');

const STANDARD = {
  'alarm/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'bets/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],

  'energy/cycles/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'energy/frequency/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'energy/intraday/index.html': ['copypng', 'dlpng', 'dlsvg'],
  'energy/merit-order/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'energy/risk/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'flow/index.html': ['copypng', 'copydoc', 'dlpng', 'dlsvg'],
  'gauge/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  'map/index.html': ['copypng', 'copymd', 'dlpng', 'dlsvg'],
  /* paths + proxy added 2026-08-16 — both already conformed; the list had simply
     been hand-kept and never caught up with the two newest tools. The coverage
     assertion below is what stops that recurring. */
  'paths/index.html': ['copypng', 'dlpng', 'dlsvg'],
  'proxy/index.html': ['copypng', 'dlpng', 'dlsvg'],
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
  const caseHTML=read('case/index.html');
  assert.match(caseHTML, /id="copypng"[^>]*>Copy decision slide/);
  for(const id of ['deckpng','decksvg','deckprint'])assert.ok(caseHTML.indexOf('id="'+id+'"')>caseHTML.indexOf('<dialog id="deckdialog"'));
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

/* Coverage, so STANDARD cannot silently fall behind the tool list again — it had
   missed paths and proxy since they shipped. Membership is decided by the page
   itself: any tool page offering the primary Copy PNG must declare its export
   hierarchy here. fermi is the one page with no bare `copypng` — its cashflow
   surface uses cfcopypng — so it is covered by `special` above and not required
   here. Tools with EXTRA surfaces (flow's batch/triage rows, gauge's second row)
   appear in both: their bare copypng below, their prefixed rows in `special`. */
test('every page with a primary Copy PNG declares its export hierarchy', async () => {
  const {TOOL_DIRS, ENERGY_TOOL_DIRS} = await import('./tool-dirs.mjs');
  const dirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => 'energy/' + d)];
  const offers = dirs.filter(dir => {
    try { return read(dir + '/index.html').includes('id="copypng"'); }
    catch { return false; }
  }).map(dir => dir + '/index.html');
  const missing = offers.filter(p => !(p in STANDARD) && p!=='case/index.html'); // Case's complete deck modal is asserted above.
  assert.deepEqual(missing, [], 'these pages offer Copy PNG but declare no export hierarchy: ' +
    missing.join(' '));
  const stale = Object.keys(STANDARD).filter(p => !offers.includes(p));
  assert.deepEqual(stale, [], 'STANDARD lists pages that no longer offer Copy PNG: ' + stale.join(' '));
});
