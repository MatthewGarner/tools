import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderFocusLive} from '../render-focus.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(f) || [])[1] || 12) * 0.55;
const ctx = {colors: {bg:'#fff', ink:'#111', muted:'#666', border:'#ccc', card:'#fff', accent:'#c05621', err:'#c00', status:{risk:'#c05621', blocked:'#c00', doing:'#2b6'}, statusInk:{risk:'#a03', blocked:'#900'}}, measure, dark:false, today:'2026-07-04'};
const doc = 'title: Habitat\nstyle: focus\nNOW\nCore: Streak freeze [doing] -- ship first\nGrowth: Referral flow\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace';

test('edit:false emits ZERO edit markup (export/golden path)', () => {
  const svg = renderFocusLive(parse(doc), {...ctx, edit:false});
  for(const a of ['data-edit','data-hit','data-hdrop','data-menu','data-key','data-lens'])
    assert.ok(!svg.includes(a), 'edit:false must not emit ' + a);
  assert.ok(svg.includes('Streak freeze'));
});
test('hero cards carry FULL edit targets (title/note/status/lane)', () => {
  const m = parse(doc);
  const svg = renderFocusLive(m, {...ctx, edit:true});
  const it = m.items.find(i => i.title === 'Streak freeze');
  assert.ok(svg.includes('data-edit="cardmenu" data-line="' + it.srcLine + '"'));
  assert.ok(/data-edit="title" data-line="\d+" data-raw="Streak freeze"/.test(svg));
  assert.ok(/data-edit="lane"/.test(svg) && /data-edit="status"/.test(svg));
});
test('rail rows are a CLEAN index: rename + cardmenu only; status/lane/note are HERO-only', () => {
  const m = parse(doc);
  const svg = renderFocusLive(m, {...ctx, edit:true});
  assert.ok(svg.includes('data-key="smart reminders"'));                 // rail row is a cardmenu group
  const heroN = m.items.filter(i => i.h === 0).length;                   // NOW is the hero
  const allN = m.items.length;
  // status + lane + note targets are HERO-only (one per hero card, set or ghost); the rail has NONE
  assert.equal((svg.match(/data-edit="lane"/g) || []).length, heroN, 'lane targets: hero only');
  assert.equal((svg.match(/data-edit="note"/g) || []).length, heroN, 'note targets: hero only');
  assert.equal((svg.match(/data-edit="status"/g) || []).length, heroN, 'status targets: hero only (rail status is a menu submenu)');
  // title targets exist on EVERY card/row (hero AND rail — every row is renamable)
  assert.equal((svg.match(/data-edit="title"/g) || []).length, allN, 'title targets: hero + rail');
});
test('EVERY horizon (incl. an empty one) emits a lens header, a data-hdrop band and a +add', () => {
  const m = parse('style: focus\nNOW\nCore: A\nNEXT\nLATER\nGrowth: B');   // NEXT is empty
  const svg = renderFocusLive(m, {...ctx, edit:true});
  const nextIdx = m.horizons.findIndex(h => h.toLowerCase() === 'next');
  assert.ok(svg.includes('data-hdrop="' + nextIdx + '"'), 'empty NEXT still has a drop band');
  assert.ok(svg.includes('data-lens="Next"'), 'empty NEXT still a lens');
  assert.ok(svg.includes('data-col="Next"'), 'empty NEXT still has +add');
});
test('a focus:-named EMPTY horizon becomes the hero (Nothing scheduled + band + add)', () => {
  const m = parse('style: focus\nfocus: Later\nNOW\nCore: A\nLATER');    // LATER empty, but focused
  const svg = renderFocusLive(m, {...ctx, edit:true});
  assert.ok(svg.includes('Nothing scheduled'));
  assert.ok(svg.includes('data-hdrop="' + m.horizons.findIndex(h=>h.toLowerCase()==='later') + '"'));
});
test('a data-hdrop band per horizon (hero + each rail section) and a data-lens per rail header', () => {
  const m = parse(doc);
  const svg = renderFocusLive(m, {...ctx, edit:true});
  for(let h=0; h<m.horizons.length; h++) assert.ok(svg.includes('data-hdrop="' + h + '"'), 'band ' + h);
  assert.ok(svg.includes('data-lens="Next"') && svg.includes('data-lens="Later"'));   // rail headers only, not the hero
  assert.ok(!svg.includes('data-lens="Now"'));   // the hero horizon is not a lens target
});
test('bands painted BEFORE their content (z-order: under, clicks reach cards)', () => {
  const svg = renderFocusLive(parse('style: focus\nNOW\nCore: A\nNEXT\nCore: B'), {...ctx, edit:true});
  assert.ok(svg.indexOf('data-hdrop="0"') < svg.indexOf('data-edit="cardmenu"'));
});
test('compare: HERO gets BOTH new and moved badges; the RAIL stays diff-clean', () => {
  const m = parse(doc);   // hero=NOW (Streak freeze, Referral flow); rail=Smart reminders(NEXT), Coach marketplace(LATER)
  const diff = {since: 'Q1', dropped: ['Legacy import'], badge: it =>
    it.title === 'Streak freeze'  ? {kind:'new',   label:'NEW'} :
    it.title === 'Referral flow'  ? {kind:'moved', label:'was Next'} :   // HERO moved → must render
    it.title === 'Smart reminders'? {kind:'moved', label:'was Later'} :  // RAIL moved → must NOT render
    null};
  const svg = renderFocusLive(m, {...ctx, edit:true, diff});
  assert.ok(/NEW/.test(svg), 'hero new badge');
  assert.ok(svg.includes('was Next'), 'hero MOVED badge must render (do not copy board-live new-only)');
  assert.ok(!svg.includes('was Later'), 'rail moved badge must NOT render (rail is diff-clean)');
  assert.ok(svg.includes('Dropped since Q1') && svg.includes('Legacy import'), 'dropped line under the hero');
});
test('content-driven height (not the slide 1080)', () => {
  const h = +renderFocusLive(parse('style: focus\nNOW\nCore: A'), {...ctx, edit:true}).match(/height="(\d+)"/)[1];
  assert.ok(h > 0 && h !== 1080);
});
