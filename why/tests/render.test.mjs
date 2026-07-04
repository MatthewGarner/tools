import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderOst} from '../render-ost.js';
import {renderMap} from '../render-map.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c',
    bg:'#f7f8f6', err:'#b33', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}},
  measure: t => t.length * 7,
  ...extra,
});
const DOC = [
  'title: Q3 retention',
  'outcome: Improve 90-day retention',
  '  Users forget mid-afternoon habits',
  '    Smart reminders [testing]',
  '      ? users want to be interrupted',
  '    Streak freeze [delivering]',
  '      ? freezes reduce churn [holds]',
  '  Habits feel like chores',
  '  Orphan feature [delivering]',
].join('\n');
const run = (renderer, doc = DOC, extra = {}) => {
  const m = parse(doc);
  return renderer(m, project(m), ctx(extra));
};

test('map view: columns from status, LATER opportunity, audit badges', () => {
  const svg = run(renderMap);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('Streak freeze'));
  assert.ok(svg.includes('Habits feel like chores'), 'unaddressed opportunity in LATER');
  assert.ok(svg.includes('OPPORTUNITY'), 'opportunity capsule');
  assert.ok(svg.includes('UNTESTED BET'), 'smart reminders flagged');
  assert.ok(svg.includes('NO WHY'), 'orphan flagged');
  assert.ok(svg.includes('⚠ NO WHY') || svg.includes('⚠ no why'.toUpperCase()), 'audit lane present');
});

test('map view: broken assumption badge in err colour', () => {
  const doc = 'outcome: O\n  Need\n    Shaky [delivering]\n      ? belief [broken]';
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('BROKEN ASSUMPTION'));
  assert.ok(svg.includes('#b33'), 'err colour used');
});

test('ost view: cards, status pills, assumption glyphs, dashed unaddressed', () => {
  const svg = run(renderOst);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('DELIVERING') && svg.includes('TESTING'));
  assert.ok(svg.includes('? users want to be interrupted'));
  assert.ok(svg.includes('✓ freezes reduce churn'));
  assert.ok(svg.includes('stroke-dasharray'), 'unaddressed opportunity dashed');
});

test('ost view: shipped dimmed; escaping works in both views', () => {
  const doc = 'outcome: O\n  Need & <more>\n    Old thing [shipped]\n    Live [delivering]';
  const ost = run(renderOst, doc);
  assert.ok(ost.includes('opacity="0.42"'));
  assert.ok(ost.includes('Need &amp; &lt;more&gt;'));
  assert.ok(run(renderMap, doc).includes('Need &amp; &lt;more&gt;'));
});

test('palette scheme applies in both views', () => {
  const doc = 'palette: ember\noutcome: O\n  Need\n    Fix [delivering]';
  assert.ok(run(renderOst, doc).includes('#C05621'));
  assert.ok(run(renderMap, doc).includes('#C05621'));
});
