import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {exportPages, exportPageCoverage} from '../export-pages.js';
import {renderDeckPages} from '../render-deck-pages.js';

const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',err:'#b33',
  status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};
const measure = text => String(text || '').length * 7;

const many = parse(`horizons: monthly from Jan 2026 x5
Feb 2026
Core: Runs across the first boundary x3
Core: B work
Apr 2026
Core: D work x2`);

test('export pages cover every source item across arbitrary horizon counts', () => {
  const plan = exportPages(many, {horizonsPerPage:3});
  assert.deepEqual(plan.pages.map(p => p.horizons), [['Jan 2026','Feb 2026','Mar 2026'], ['Apr 2026','May 2026']]);
  assert.equal(exportPageCoverage(plan).complete, true);
  assert.deepEqual(plan.pages.map(p => p.total), [2,2]);
});

test('a typical five-horizon roadmap remains one complete 16:9 slide', () => {
  const plan = exportPages(many);
  assert.equal(plan.pages.length, 1);
  assert.equal(exportPageCoverage(plan).complete, true);
});

test('a span crossing a page boundary is explicit on both page projections', () => {
  const [first, second] = exportPages(many, {horizonsPerPage:3}).pages;
  const start = first.model.items.find(item => item.title.startsWith('Runs'));
  const carry = second.model.items.find(item => item.title.startsWith('Runs'));
  assert.equal(start.export.continuesAfter, true);
  assert.equal(carry.export.continuesBefore, true);
  assert.equal(carry.h, 0);
  assert.equal(carry.span, 1);
});

test('a terminal span retains its end and every page knows its total', () => {
  const [, second] = exportPages(many, {horizonsPerPage:3}).pages;
  const item = second.model.items.find(entry => entry.title === 'D work');
  assert.equal(item.span, 2);
  assert.equal(item.export.sourceEnd, 4);
  assert.equal(second.index, 1);
  assert.equal(second.total, 2);
});

test('density creates an exhaustive continuation set instead of an overflow chip', () => {
  const dense = parse(`title: Complete delivery plan
horizons: monthly from Jan 2026 x5
Jan 2026
Core: A deliberately long item title that needs more than one reasonable line and must not disappear from the deck [bet: choice] x3 -- its supporting note is equally important
Core: B [risk]
Core: C [if choice] x3
Core: D
Core: E
Core: F
Feb 2026
Core: G
Mar 2026
Core: H
Apr 2026
Core: I
May 2026
Core: J
Core: K
Core: L
Core: M
Core: N`);
  const out = renderDeckPages(dense, {colors, measure, today:'2026-08-14'});
  assert.ok(out.pages.length > 1);
  const all = out.pages.join('');
  for(const item of dense.items.filter(item => item.title.length < 30)) assert.match(all, new RegExp(item.title));
  for(const fragment of ['A deliberately long item title that needs', 'more than one reasonable line and must', 'not disappear from the deck'])
    assert.match(all, new RegExp(fragment));
  assert.doesNotMatch(all, /\+ \d+ more/);
  assert.match(all, /IF CHOICE/);
  assert.match(all, /RUNS Jan 2026 — Mar 2026/);
  assert.match(all, /Complete delivery plan/);
});

test('comparison page sets include dropped work as an explicit page', () => {
  const current = parse('title: Current\nNOW\nCore: Kept');
  const out = renderDeckPages(current, {colors, measure, today:'2026-08-14',
    diff:{since:'2026-08-01', dropped:['Removed initiative'], badge:() => null, any:true}});
  assert.equal(out.pages.length, 2);
  assert.match(out.pages[0], /BASELINE · 2026-08-01/);
  assert.match(out.pages[1], /DROPPED SINCE 2026-08-01/);
  assert.match(out.pages[1], /Removed initiative/);
  assert.match(out.pages[1], /PAGE 2 OF 2/);
});

test('long frame copy gains wrapped height rather than an ellipsis', () => {
  const title = 'A roadmap title that intentionally keeps going past the old single-line frame limit without losing its final source words';
  const headline = 'This deliberately long headline carries the meeting narrative through several full lines and must remain completely readable in the exported slide frame.';
  const story = 'The comparison story is also complete: it explains why the work moved, without being quietly cut short in a continuation artefact.';
  const out = renderDeckPages(parse(`title: ${title}\nheadline: ${headline}\nstory: ${story}\nNOW\nCore: Kept`), {
    colors, measure, today:'2026-08-14', diff:{since:'Baseline', any:true, dropped:[], badge:() => null},
  });
  assert.equal(out.pages.length, 1);
  assert.equal(out.pages[0].includes('…'), false);
  for(const word of ['final', 'words', 'completely', 'readable', 'quietly', 'short']) assert.match(out.pages[0], new RegExp(word));
});
