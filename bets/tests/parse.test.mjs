import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';

const FULL = `title: Q3 product portfolio
unit: £k
palette: ocean

Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Referral loop: stake 45, odds 15-35%, payoff 200-600
    kill: <5% invite rate by March

Platform
  Billing rewrite: stake 200, odds 85-95%, payoff 250-350`;

test('config keys parse before the first group', () => {
  const m = parse(FULL);
  assert.equal(m.title, 'Q3 product portfolio');
  assert.equal(m.unit, '£k');
  assert.equal(m.palette, 'ocean');
});

test('groups and bets with ranges + point values', () => {
  const m = parse(FULL);
  assert.equal(m.groups.length, 2);
  assert.deepEqual(m.groups.map(g => g.name), ['Growth', 'Platform']);
  const b = m.groups[0].bets[0];
  assert.equal(b.name, 'Search revamp');
  assert.deepEqual(b.stake, [120, 120]);          // point → [v,v]
  assert.deepEqual(b.odds, [30, 50]);
  assert.deepEqual(b.payoff, [400, 900]);
});

test('kill text + YYYY-MM-DD by-date extraction; non-date "by" stays in text', () => {
  const m = parse(FULL);
  const k1 = m.groups[0].bets[0].kill;
  assert.equal(k1.text, 'CTR flat after 2 sprints');
  assert.equal(k1.by, '2026-09-01');
  const k2 = m.groups[0].bets[1].kill;
  assert.equal(k2.by, null);                       // "by March" is not a date
  assert.match(k2.text, /invite rate by March/);
});

test('srcLine correct on group, bet, kill (1-indexed)', () => {
  const m = parse(FULL);
  assert.equal(m.groups[0].srcLine, 5);            // "Growth"
  assert.equal(m.groups[0].bets[0].srcLine, 6);    // "Search revamp: ..."
  assert.equal(m.groups[0].bets[0].kill.srcLine, 7);
  assert.equal(m.groups[1].srcLine, 11);           // "Platform"
});

test('en-dash and hyphen both accepted in ranges', () => {
  const m = parse(`G\n  B: stake 10, odds 20–40%, payoff 5–9`);   // en-dashes
  assert.deepEqual(m.groups[0].bets[0].odds, [20, 40]);
  assert.deepEqual(m.groups[0].bets[0].payoff, [5, 9]);
});

test('// comments and blank lines are skipped and do not shift srcLine', () => {
  const m = parse(`// a comment\ntitle: T\n\nG\n  // inline note\n  B: stake 1, odds 2-3%, payoff 4-5`);
  assert.equal(m.title, 'T');
  assert.equal(m.groups[0].bets[0].srcLine, 6);
});

test('warn: bet missing each of stake / odds / payoff, line-numbered', () => {
  const m = parse(`G\n  Bad: odds 30-50%, payoff 400-900`);   // no stake
  const w = m.warnings.find(w => /stake/i.test(w.msg));
  assert.ok(w, 'missing-stake warning present');
  assert.equal(w.line, 2);
});

test('warn: odds outside 0–100', () => {
  const m = parse(`G\n  B: stake 10, odds 80-120%, payoff 5-9`);
  assert.ok(m.warnings.some(w => /odds/i.test(w.msg) && w.line === 2));
});

test('warn: kill with no parent bet', () => {
  const m = parse(`G\n    kill: orphaned kill line`);
  assert.ok(m.warnings.some(w => /kill/i.test(w.msg) && w.line === 2));
  assert.equal(m.groups[0].bets.length, 0);
});

test('warn + implicit "Bets" group: a bet before any group', () => {
  const m = parse(`  Loose: stake 10, odds 20-40%, payoff 30-60`);
  assert.equal(m.groups.length, 1);
  assert.equal(m.groups[0].name, 'Bets');
  assert.equal(m.groups[0].bets[0].name, 'Loose');
  assert.ok(m.warnings.some(w => /group/i.test(w.msg)));
});

test('warn: config key after the first group is ignored', () => {
  const m = parse(`G\n  B: stake 1, odds 2-3%, payoff 4-5\nunit: £m`);
  assert.notEqual(m.unit, '£m');
  assert.ok(m.warnings.some(w => /config/i.test(w.msg) || /before/i.test(w.msg)));
});

test('warn: unknown config key ignored with a warning', () => {
  const m = parse(`colour: blue\nG\n  B: stake 1, odds 2-3%, payoff 4-5`);
  assert.ok(m.warnings.some(w => /colour|unknown/i.test(w.msg)));
});

test('empty input → empty model, no throw', () => {
  const m = parse('');
  assert.deepEqual(m.groups, []);
  assert.deepEqual(m.warnings, []);
});
