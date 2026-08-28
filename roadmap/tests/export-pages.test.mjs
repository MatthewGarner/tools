import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {exportPages, exportPageCoverage} from '../export-pages.js';
import {renderDeckPages} from '../render-deck-pages.js';
import {deckBodyBounds, paletteColors} from '../render-deck.js';

const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',err:'#b33',
  status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};
const measure = text => String(text || '').length * 7;

/* This is the app's normal Reading roadmap, held here as an export
   composition fixture. It is complex enough to exercise notes, statuses,
   decisions and three lanes, but must still present as one 16:9 artefact. */
const READING_APP = `title: Lantern — Product Roadmap
headline: Retention first — everything in Now keeps readers reading
horizons: Now, Next, Later

NOW
Core: Resume where you left off [doing] -- the top-requested fix for a lost place
Core: Curated shelves [doing]
Growth: Referral flow [risk] -- waiting on app-store review
Platform: Sync engine rewrite -- conflicts are the #1 support driver

NEXT
Core: Reading reminders [bet: reminders] -- learn each reader's natural time of day
Growth: Home-screen widget gallery
Platform: Offline downloads

LATER
Core: Reminder personalisation [if reminders]
Core: Digest emails [unless reminders] -- the fallback nudge channel
Core: Book clubs -- small groups, shared shelves
Growth: Publisher storefront
Platform: E-reader sync`;

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

test('the default Reading roadmap is one deliberate Copy-PNG artefact in every selected view', () => {
  for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderDeckPages(parse('style: ' + style + '\n' + READING_APP), {colors, measure, today:'2026-08-14'});
    assert.equal(out.pages.length, 1, style + ' does not strand ordinary work on a sparse continuation');
    assert.equal(out.plan.pages[0].sourceItemIndices.length, 12, style + ' keeps all source work on its considered page');
    const page = out.pages[0];
    assert.match(page, /E-reader sync/);
    assert.doesNotMatch(page, /<rect x="100" y="64" width="56"/, 'the shared frame adds no decorative mark');
  }
  const grid = renderDeckPages(parse('style: grid\n' + READING_APP), {colors, measure, today:'2026-08-14'}).pages[0];
  assert.equal((grid.match(/>CORE<\/text>/g) || []).length, 1, 'Grid states each lane once in its rail, not inside every band');
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
  assert.doesNotMatch(all, /RUNS Jan 2026 — Mar 2026/, 'Grid width already carries an on-page run');
  assert.match(all, /Complete delivery plan/);
});

test('Copy-PNG creates continuation pages before dense Grid or Board body text can cross its footer', () => {
  const items = Array.from({length:12}, (_, i) =>
    'Core: Initiative ' + (i + 1) + ' with enough words to take two measured lines in a narrow export column').join('\n');
  for(const style of ['grid', 'board']){
    const out = renderDeckPages(parse('style: ' + style + '\nNOW\n' + items), {colors, measure, today:'2026-08-14'});
    assert.ok(out.pages.length > 1, style + ' splits ordinary dense work before it can overflow');
    for(const page of out.pages){
      const ys = [...page.matchAll(/<text[^>]*\sy="([0-9.]+)"[^>]*>Initiative/g)].map(match => +match[1]);
      assert.ok(ys.length > 0, style + ' retains visible source work on every continuation');
      assert.ok(Math.max(...ys) < 900, style + ' source body remains well above the frame footer');
    }
  }
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

test('Register labels comparison drops with their honest synthetic horizon', () => {
  const out = renderDeckPages(parse('style: register\nNOW\nCore: Kept'), {colors, measure,
    today:'2026-08-14', diff:{since:'Baseline', dropped:['Retired route'], badge:() => null, any:true}});
  assert.match(out.pages[1], />Changed work<\/text>/);
  assert.doesNotMatch(out.pages[1], />NOW<\/text>/);
});

test('comparison drops use every selected-view geometry planner and count toward completeness', () => {
  const current = parse('title: Current\nNOW\nCore: Kept');
  const dropped = Array.from({length:6}, (_, index) =>
    Array.from({length:99}, (_, word) => `retired${index + 1}-${word + 1}`).join(' ') +
      ` drop-final-${index + 1}`);
  for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderDeckPages({...current, style}, {colors, measure, today:'2026-08-14',
      diff:{since:'Baseline', dropped, badge:() => null, any:true}});
    const coverage = exportPageCoverage(out.plan);
    assert.equal(coverage.complete, true, `${style} proves current and comparison coverage`);
    assert.equal(coverage.seen.size, 1);
    assert.equal(coverage.comparisonSeen.size, 6);
    assert.ok(out.pages.length > 2, `${style} fragments and paginates long comparison titles`);
    const all = out.pages.join('\n');
    for(let index = 1; index <= 6; index++){
      const marker = `drop-final-${index}`;
      const match = all.match(new RegExp(`<text[^>]*y="([\\d.]+)"[^>]*>[^<]*${marker}</text>`));
      assert.ok(match, `${style} retains ${marker}`);
      assert.ok(Number(match[1]) < 930, `${style} keeps ${marker} above the factual footer`);
    }
    assert.doesNotMatch(all, /\+ \d+ more/);
  }
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

test('a one-page selected view is still exhaustive, never a legacy clipped deck', () => {
  const title = 'A board title deliberately longer than the old one-line deck allowance so every authored word must remain present';
  const note = 'A supporting note long enough to prove the old native deck cannot quietly choose the clipped fast path.';
  const out = renderDeckPages(parse(`style: board\nNOW\nCore: ${title} -- ${note}`), {colors, measure, today:'2026-08-14'});
  assert.equal(out.pages.length, 1);
  assert.doesNotMatch(out.pages[0], /…|\+ \d+ more/);
  for(const word of ['deliberately', 'authored', 'supporting', 'quietly', 'clipped']) assert.match(out.pages[0], new RegExp(word));
  assert.match(out.pages[0], /BOARD · COMPLETE READING SET/);
});

test('Copy-PNG page-set output shares Grid bands and Board ledger rows with live views', () => {
  const source = `horizons: quarterly from Q3 2026 x3
Q3 2026
Core: A durable initiative [doing] x2
Q4 2026
Growth: A second commitment`;
  const grid = renderDeckPages(parse('style: grid\n' + source), {colors, measure, today:'2026-08-14'}).pages[0];
  const board = renderDeckPages(parse('style: board\n' + source), {colors, measure, today:'2026-08-14'}).pages[0];
  for(const page of [grid, board]){
    assert.doesNotMatch(page, /fill="#08c0D"/, 'no legacy accent-tinted horizon boxes');
    assert.doesNotMatch(page, /<rect[^>]*stroke=/, 'ordinary commitments are not outlined cards');
  }
  assert.match(grid, /fill="#222" fill-opacity="0\.08"/, 'Grid exports its neutral occupancy bands');
  assert.match(board, /stroke-width="1" opacity="0\.7"/, 'Board exports ruled ledger rows');
});

test('every selected view retains its own exhaustive composition across a page set', () => {
  const horizons = Array.from({length:8}, (_, i) => 'Horizon ' + (i + 1));
  const source = [`horizons: ${horizons.join(', ')}`, ...horizons.map((horizon, i) =>
    `${horizon}\nCore: Work ${i + 1}`)].join('\n');
  const expected = {grid:'GRID', board:'BOARD', focus:'FOCUS', register:'REGISTER'};
  for(const [style, label] of Object.entries(expected)){
    const out = renderDeckPages(parse(`style: ${style}\n${source}`), {colors, measure, today:'2026-08-14'});
    assert.equal(out.pages.length, style === 'focus' ? 1 : 2,
      style + ' keeps its selected composition at a readable density');
    assert.ok(out.pages.every(page => page.includes(label + ' · COMPLETE READING SET')), style + ' preserves its composition');
    assert.doesNotMatch(out.pages.join(''), /…|\+ \d+ more/);
  }
});

test('Focus balances a real continuation and does not print empty horizon rails', () => {
  const horizons = ['One','Two','Three','Four','Five','Six','Seven','Eight'];
  const entries = horizons.flatMap((horizon, index) => [
    horizon,
    'Core: Work ' + (index * 2 + 1),
    'Core: Work ' + (index * 2 + 2),
  ]);
  const out = renderDeckPages(parse(`style: focus\nhorizons: ${horizons.join(', ')}\n${entries.join('\n')}`), {
    colors, measure, today:'2026-08-14',
  });
  assert.equal(out.pages.length, 2);
  assert.match(out.pages[0], /Work 8/);
  assert.match(out.pages[1], /Work 9/);
  assert.match(out.pages[1], /Work 16/);
  for(const empty of ['ONE','TWO','THREE','FOUR'])
    assert.doesNotMatch(out.pages[1], new RegExp('>' + empty + '</text>'));
  for(const populated of ['FIVE','SIX','SEVEN','EIGHT'])
    assert.match(out.pages[1], new RegExp('>' + populated + '</text>'));
});

test('Focus paginates a dense hero before any authored item crosses the 1080-page bounds', () => {
  const items = Array.from({length:12}, (_, index) =>
    `Core: Focus item ${String(index + 1).padStart(2, '0')}`).join('\n');
  const out = renderDeckPages(parse(`style: focus\nNOW\n${items}`), {
    colors, measure, today:'2026-08-14',
  });
  assert.ok(out.pages.length > 1, 'twelve hero rows need a bounded continuation');
  const seen = new Set();
  out.pages.forEach((page, pageIndex) => {
    assert.match(page, /^<svg[^>]*height="1080"/);
    for(const match of page.matchAll(/<g data-i="(\d+)" data-y0="([\d.]+)" data-y1="([\d.]+)">/g)){
      const sourceIndex = Number(match[1]), top = Number(match[2]), bottom = Number(match[3]);
      assert.ok(top >= 0 && bottom > top, `Focus item ${sourceIndex + 1} must have real visible geometry`);
      assert.ok(bottom < 968,
        `Focus item ${sourceIndex + 1} on page ${pageIndex + 1} must remain above the factual footer, got bottom=${bottom}`);
      seen.add(sourceIndex);
    }
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({length:12}, (_, index) => index));
});

test('all selected views paginate against the actual narrative frame height', () => {
  const words = (prefix, count) => Array.from({length:count}, (_, index) => `${prefix}${index + 1}`).join(' ');
  const items = Array.from({length:12}, (_, index) =>
    `Core: Frame item ${String(index + 1).padStart(2, '0')}`).join('\n');
  const source = `title: ${words('title', 80)}\nheadline: ${words('headline', 70)}\nstory: ${words('story', 100)}\nverdict: ${words('verdict', 35)}\nNOW\n${items}`;
  for(const style of ['grid', 'board', 'focus', 'register']){
    const model = parse(`style: ${style}\n${source}`);
    const ctx = {colors, measure, today:'2026-08-14',
      diff:{since:'A baseline with wrapped provenance', dropped:[], badge:() => null, any:true}};
    const bounds = deckBodyBounds(model, ctx, paletteColors(model, ctx));
    const out = renderDeckPages(model, ctx), seen = new Set();
    assert.ok(out.pages.length > 1, `${style} gives dynamic frame copy its physical space`);
    assert.equal(exportPageCoverage(out.plan).complete, true);
    for(const page of out.pages){
      for(const match of page.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*>Frame item (\d{2})<\/text>/g)){
        assert.ok(Number(match[1]) + 40 <= bounds.bottom, `${style} item ${match[2]} stays above the verdict`);
        seen.add(match[2]);
      }
    }
    assert.equal(seen.size, 12, `${style} keeps every framed item visible`);
  }
});

test('an indivisible frame with no item band refuses complete export', () => {
  const title = Array.from({length:1_000}, (_, index) => `frame${index + 1}`).join(' ');
  for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderDeckPages(parse(`style: ${style}\ntitle: ${title}\nNOW\nCore: Kept`),
      {colors, measure, today:'2026-08-14'});
    assert.equal(out.complete, false, `${style} cannot certify an item that has no physical frame space`);
    assert.equal(exportPageCoverage(out.plan).complete, false);
  }
});

test('an unbroken item token is grapheme-fragmented inside every selected view', () => {
  const token = 'x'.repeat(500);
  for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderDeckPages(parse(`style: ${style}\nNOW\nCore: ${token}`),
      {colors, measure, today:'2026-08-14'});
    assert.equal(exportPageCoverage(out.plan).complete, true);
    let authoredCharacters = 0;
    for(const page of out.pages){
      for(const match of page.matchAll(/<text\sx="([\d.]+)"[^>]*>(x+)<\/text>/g)){
        const x = Number(match[1]), text = match[2];
        authoredCharacters += text.length;
        assert.ok(x + measure(text) <= 1820, `${style} token fragment stays inside the artboard`);
      }
    }
    assert.equal(authoredCharacters, 500, `${style} preserves the complete token exactly once`);
  }
});

test('unbroken frame copy wraps while an unrenderable direct horizon label refuses completeness', () => {
  const token = 'z'.repeat(500);
  for(const style of ['grid', 'board', 'focus', 'register']){
    const framed = renderDeckPages(parse(`style: ${style}\ntitle: ${token}\nNOW\nCore: Kept`),
      {colors, measure, today:'2026-08-14'});
    assert.equal(framed.complete, true, `${style} hard-wraps frame copy`);
    for(const match of framed.pages[0].matchAll(/<text\sx="([\d.]+)"[^>]*>(z+)<\/text>/g))
      assert.ok(Number(match[1]) + measure(match[2]) <= 1820, `${style} frame token stays bounded`);

    const source = `style: ${style}\nhorizons: ${token}, Later\n${token}\nCore: Kept`;
    const horizon = renderDeckPages(parse(source), {colors, measure, today:'2026-08-14'});
    if(style === 'register') assert.equal(horizon.complete, true, 'Register wraps its horizon cell');
    else assert.equal(horizon.complete, false, `${style} refuses an unbounded direct horizon heading`);
  }
});

test('fixed-width Grid and Board labels refuse local collisions', () => {
  const horizon = 'h'.repeat(80);
  const source = `horizons: ${horizon}, Two, Three, Four, Five\n${horizon}\nCore: Kept`;
  for(const style of ['grid', 'board']){
    const out = renderDeckPages(parse(`style: ${style}\n${source}`), {colors, measure, today:'2026-08-14'});
    assert.equal(out.complete, false, `${style} does not certify a heading that crosses its column`);
  }
  const lane = 'l'.repeat(40);
  const grid = renderDeckPages(parse(`style: grid\nNOW\n${lane}: Kept`), {colors, measure, today:'2026-08-14'});
  assert.equal(grid.complete, false, 'Grid does not certify a lane label that crosses its fixed rail');
});

test('note-only continuations never restore an exhausted unbounded title token', () => {
  const token = 'x'.repeat(500);
  const note = Array.from({length:900}, (_, index) => `note${index + 1}`).join(' ') + ' final-note-marker';
  for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderDeckPages(parse(`style: ${style}\nNOW\nCore: ${token} -- ${note}`),
      {colors, measure, today:'2026-08-14'});
    assert.equal(out.complete, true);
    const all = out.pages.join('\n');
    assert.match(all, /Item continued/);
    assert.match(all, /final-note-marker/);
    const chunks = [...all.matchAll(/<text\sx="([\d.]+)"[^>]*>(x+)<\/text>/g)];
    assert.equal(chunks.reduce((sum, match) => sum + match[2].length, 0), 500);
    for(const match of chunks)
      assert.ok(Number(match[1]) + measure(match[2]) <= 1820, `${style} never restores the raw title`);
  }
});

test('an exceptionally long source note becomes bounded, explicit item continuations', () => {
  const markers = Array.from({length:240}, (_, i) => 'marker' + String(i + 1).padStart(3, '0'));
  const out = renderDeckPages(parse(`style: board
NOW
Core: Durable initiative -- ${markers.join(' ')}`), {colors, measure, today:'2026-08-14'});
  assert.ok(out.pages.length > 1, 'long source text earns pages, not smaller type');
  const all = out.pages.join('');
  for(const marker of markers) assert.match(all, new RegExp(marker));
  assert.match(all, /ITEM PART 2 OF/);
  assert.doesNotMatch(all, /…|\+ \d+ more/);
  /* y=984 is the resolved verdict, y=990 the page marker and y=1036 the
     factual metrics footer. Any other text below the body band would prove a
     card crossed into the footer. */
  for(const page of out.pages){
    const low = [...page.matchAll(/<text[^>]* y="([\d.]+)"[^>]*>/g)]
      .map(match => Number(match[1])).filter(y => y > 968);
    assert.ok(low.every(y => y === 984 || y === 990 || y === 1036), 'body text stays above the factual footer: ' + low.join(', '));
  }
});
