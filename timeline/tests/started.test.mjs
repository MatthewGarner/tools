import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate, parseStarted} from '../parse.js';
import {editStarted, editDates, setConfig, setStatus, validators} from '../edit-targets.js';
import {timingFacts} from '../timing.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
const day = parseDate;
const forecast = 'Build: Beta 2026-09-20 .. 2026-10-04 [started: 2026-08-24] // review externally';

test('actual starts are full valid UTC dates; malformed or repeated tags warn softly', () => {
  const model = parse(forecast);
  assert.equal(model.items[0].started, day('2026-08-24'));
  assert.deepEqual(model.warnings, []);
  assert.equal(parse('Beta 2026-09 .. 2026-10').items[0].started, null);
  for(const bad of ['2026-08', '2026-02-30', 'soon']){
    assert.equal(parseStarted(bad), null);
    const invalid = parse(`Beta 2026-09 .. 2026-10 [started: ${bad}]`);
    assert.equal(invalid.items[0].started, null);
    assert.match(invalid.warnings.join(' '), /line 1: actual start wants a full date/);
  }
  const repeated = parse(forecast.replace(' //', ' [started: 2026-08-25] //'));
  assert.equal(repeated.items[0].started, day('2026-08-24'));
  assert.match(repeated.warnings.join(' '), /more than one actual start/);
});

test('contradictory start facts warn without rewriting forecasts, regardless of today config position', () => {
  const model = parse('Beta 2026-09-01 .. 2026-09-20 [started: 2026-09-10]\ntoday: 2026-09-05');
  assert.equal(model.items[0].started, day('2026-09-10'));
  assert.equal(model.items[0].p50, day('2026-09-01'));
  assert.match(model.warnings.join(' '), /after P50 finish/);
  assert.match(model.warnings.join(' '), /after today/);
  const fixed = parse('Conference 2026-12-15 [fixed] [lead: 6w] [started: 2026-08-24]');
  assert.equal(fixed.items[0].started, null);
  assert.equal(fixed.items[0].leadDays, 42);
  assert.match(fixed.warnings.join(' '), /external event — ignored/);
});

test('calendar durations use actual start and the effective clock, never an inferred start or progress', () => {
  const item = parse(forecast).items[0];
  assert.deepEqual(timingFacts(item, day('2026-09-05')), {started: day('2026-08-24'), valid:true,
    issue:null, completed:false, end:day('2026-09-05'), elapsedDays:12, p50DurationDays:27, p90DurationDays:41});
  const done = parse('Beta 2026-09-01 [done] [started: 2026-08-24]').items[0];
  assert.equal(timingFacts(done, day('2026-09-05')).elapsedDays, 8);
  assert.equal(timingFacts(done, day('2026-10-05')).elapsedDays, 8);
  const sameDay = parse('Beta 2026-08-24 [done] [started: 2026-08-24]').items[0];
  assert.equal(timingFacts(sameDay, day('2026-09-05')).elapsedDays, 0);
  for(const candidate of [{...item,started:null}, {...item,started:day('2026-10-10')}, {...item,started:day('2026-09-10')}, {...done,p50:day('2026-10-05')}]){
    const facts = timingFacts(candidate, day('2026-09-05'));
    assert.equal(facts.valid, false);
    assert.equal(facts.elapsedDays, null);
    assert.equal(facts.p50DurationDays, null);
    assert.equal(facts.p90DurationDays, null);
  }
});

test('start edits preserve notes, dates and status; date edits preserve all authored start placements', () => {
  assert.ok(validators.started(''));
  assert.ok(validators.started('2026-08-24'));
  assert.ok(!validators.started('2026-08'));
  assert.ok(!validators.started('2026-08-24\n'));
  const changed = editStarted(forecast, '2026-08-25');
  assert.equal(parse(changed).items[0].started, day('2026-08-25'));
  assert.equal(parse(changed).items[0].note, 'review externally');
  assert.equal(parse(editStarted(changed, '')).items[0].started, null);
  assert.equal(editStarted(forecast, '2026-08'), forecast);
  const fixed = 'Conference 2026-12-15 [fixed] // [started: 2026-08-24]';
  assert.equal(editStarted(fixed, '2026-08-25'), fixed);
  assert.equal(parse(setStatus(forecast, 'fixed')).items[0].started, null);
  for(const line of [forecast,
    'Build: Beta [started: 2026-08-24] 2026-09-20 .. 2026-10-04 // note',
    'Build: Beta 2026-09-20 [started: 2026-08-24] .. 2026-10-04 // note']){
    const edited = parse(editDates(line, parse(line).items[0].rawDates, '2026-09-21 .. 2026-10-05')).items[0];
    assert.equal(edited.started, day('2026-08-24'));
    assert.equal(edited.p50, day('2026-09-21'));
    assert.equal(edited.p90, day('2026-10-05'));
  }
});

test('view and font config are canonical, warn on invalid values, and collapse duplicate declarations', () => {
  assert.equal(parse('').font, 'Chapter');
  assert.equal(parse('').style, 'field');
  for(const style of ['field','review','decisions','register']) assert.equal(parse('style: ' + style.toUpperCase()).style, style);
  assert.equal(parse('font: dm sans').font, 'DM Sans');
  const invalid = parse('style: legacy\nfont: Comic Sans');
  assert.equal(invalid.style, 'field');
  assert.equal(invalid.font, 'Chapter');
  assert.equal(invalid.warnings.length, 2);
  const text = 'style: field\nStyle: Work 2026-09 .. 2026-10\nstyle: review';
  const changed = setConfig(text, 'style', 'DECISIONS');
  assert.equal(changed, 'Style: Work 2026-09 .. 2026-10\nstyle: decisions');
  assert.equal(parse(changed).items.length, 1);
  assert.equal(parse(changed).style, 'decisions');
  assert.equal(setConfig(changed, 'style', ''), 'Style: Work 2026-09 .. 2026-10');
  assert.equal(setConfig(forecast, 'font', 'dm sans'), 'font: DM Sans\n' + forecast);
  assert.equal(setConfig(forecast, 'style', 'unknown'), forecast);
  assert.equal(setConfig(forecast, 'title', 'injected\nstyle: review'), forecast);
});

test('snapshot changes retain start history without inventing a finish slip, plus complete dropped facts', () => {
  const changed = forecast.replace('started: 2026-08-24', 'started: 2026-08-25');
  const view = timelineDiffView(timelineDiff(parse(forecast), parse(changed)), 'last pack');
  assert.equal(view.any, true);
  assert.deepEqual(view.slips, []);
  const history = [...view.byKey.values()][0];
  assert.deepEqual(history.history, ['started']);
  assert.equal(history.oldStarted, day('2026-08-24'));
  assert.match(view.sinceLine, /1 start changed/);
  const removed = timelineDiffView(timelineDiff(parse(forecast), parse(editStarted(forecast, ''))), 'last pack');
  assert.deepEqual([...removed.byKey.values()][0].history, ['started']);
  const dropped = timelineDiffView(timelineDiff(parse(forecast), parse('')), 'last pack');
  assert.deepEqual(dropped.dropped, ['Beta']);
  assert.equal(dropped.droppedItems[0].started, day('2026-08-24'));
  assert.equal(dropped.droppedItems[0].lane, 'Build');
  assert.equal(dropped.droppedItems[0].note, 'review externally');
  assert.equal(dropped.droppedItems[0].p90, day('2026-10-04'));
});
