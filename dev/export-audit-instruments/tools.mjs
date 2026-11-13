/* Per-tool knowledge for the audit: how to open a stress document, which views it has, which export
   controls each view offers, and where the live artefact is. */
import {hashFor, settle, sleep} from './lib.mjs';

const svgReady = async page => {
  await page.waitForFunction(() => document.querySelector('#preview svg') || document.querySelector('#preview .placeholder'), null, {timeout: 20000});
  await settle(page);
};
const PIC = [
  {id: 'svg', kind: 'svg', sel: '#dlsvg'},
  {id: 'png', kind: 'png', sel: '#dlpng'},
  {id: 'copypng', kind: 'copypng', sel: '#copypng'},
];

export const TOOLS = {
  bets: {
    path: '/bets/',
    hash: doc => hashFor({t: doc.source}),
    ready: svgReady,
    live: '#preview',
    views: () => ['board', 'quadrant'],
    async select(page, view){
      await page.locator(`#viewtoggle [data-view="${view}"]`).click();
      await page.waitForFunction(v => document.querySelector(`#viewtoggle [data-view="${v}"]`)?.getAttribute('aria-pressed') === 'true', view).catch(() => {});
      await settle(page);
    },
    exports: () => [...PIC, {id: 'slide', kind: 'copypng', sel: '#copyslide'}, {id: 'md', kind: 'md', sel: '#copymd'}, {id: 'verdict', kind: 'text', sel: '.vcopy'}],
  },
  tree: {
    path: '/tree/',
    hash: doc => hashFor({t: doc.source}),
    ready: svgReady,
    live: '#preview',
    views: () => ['diagram'],
    async select(){},
    exports: () => [...PIC, {id: 'slide', kind: 'copypng', sel: '#copyslide'}],
  },
  paths: {
    path: '/paths/',
    hash: doc => hashFor({t: doc.source}),
    ready: svgReady,
    live: '#preview',
    views: () => ['brief', 'agenda', 'question', 'conditions', 'tree', 'plans'],
    async select(page, view){
      await page.evaluate(v => { const b = document.querySelector(`[data-paths-view="${v}"]`); b?.closest('details')?.setAttribute('open', ''); b?.click(); }, view);
      await sleep(300);
      await settle(page);
      await page.evaluate(() => document.querySelector('details.paths-more-views')?.removeAttribute('open'));
    },
    exports: view => [...PIC,
      ...(view === 'agenda' ? [{id: 'agenda-svg', kind: 'svg', sel: '#agenda-receipt-svg', receipt: true}, {id: 'agenda-png', kind: 'png', sel: '#agenda-receipt-png', receipt: true}] : []),
      {id: 'closeout-svg', kind: 'svg', sel: '#closeout-receipt-svg', receipt: true}, {id: 'closeout-png', kind: 'png', sel: '#closeout-receipt-png', receipt: true}],
  },
  fermi: {
    path: '/fermi/',
    hash: doc => hashFor(doc.state),
    async ready(page){
      await page.waitForFunction(() => {
        const r = document.getElementById('results'), cf = document.getElementById('cfwrap');
        return (cf && cf.querySelector('svg') && !document.getElementById('cfresults').hidden) || (r && r.style.display !== 'none' && document.getElementById('p50')?.textContent.trim()) || document.getElementById('ph')?.offsetParent;
      }, null, {timeout: 20000}).catch(() => {});
      await settle(page, '#resultreview, #cfwrap', 3);
      await sleep(400);
    },
    live: view => view === 'cf' ? '#cfwrap' : view === 'tree' ? '#driverwrap' : '.histwrap',
    views: doc => doc.state.m === 'cf' ? ['cf'] : ['dist', 'tree'],
    async select(page, view){
      if(view === 'tree'){ await page.click('#viewtree'); await page.waitForSelector('#driverwrap svg', {timeout: 10000}).catch(() => {}); await settle(page, '#driverwrap'); }
      if(view === 'dist'){ await page.click('#viewdist').catch(() => {}); await sleep(300); }
    },
    exports: view => view === 'cf'
      ? [{id: 'svg', kind: 'svg', sel: '#cfsvg'}, {id: 'png', kind: 'png', sel: '#cfpng'}, {id: 'copypng', kind: 'copypng', sel: '#cfcopypng'}, {id: 'md', kind: 'md', sel: '#cfcopydoc'}]
      : [...(view === 'tree' ? [{id: 'svg', kind: 'svg', sel: '#treesvg'}, {id: 'png', kind: 'png', sel: '#treepng'}] : [{id: 'png', kind: 'png', sel: '#png', canvas: true}]),
        {id: 'md', kind: 'md', sel: '#copydoc'}, {id: 'summary', kind: 'text', sel: '#copy'}, {id: 'verdict', kind: 'text', sel: '.vcopy'}],
  },
  rank: {
    path: '/rank/',
    hash: doc => hashFor(doc.state),
    async ready(page){ await page.waitForFunction(() => document.querySelector('#rrows')?.children.length, null, {timeout: 20000}).catch(() => {}); await settle(page, '#rrows'); await sleep(300); },
    live: '#rrows',
    views: () => ['table'],
    async select(){},
    exports: () => [{id: 'md', kind: 'md', sel: '#copydoc'}, {id: 'verdict', kind: 'text', sel: '.vcopy'}],
  },
};
