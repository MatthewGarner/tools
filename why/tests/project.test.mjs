import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';

const labels = arr => arr.map(x => x.node.label);

test('column derivation: delivering→NOW, testing→NEXT, unaddressed opportunity→LATER', () => {
  const m = parse([
    'outcome: Retention',
    '  Forgetting habits',
    '    Smart reminders [testing]',
    '    Streak freeze [delivering]',
    '  Habits feel like chores',
  ].join('\n'));
  const p = project(m);
  assert.deepEqual(labels(p.now), ['Streak freeze']);
  assert.deepEqual(labels(p.next), ['Smart reminders']);
  assert.deepEqual(labels(p.later), ['Habits feel like chores']);
});

test('candidates do not rescue an opportunity from LATER', () => {
  const m = parse('outcome: O\n  Need\n    Idea [candidate]');
  const p = project(m);
  assert.deepEqual(labels(p.later), ['Need']);
  assert.equal(p.now.length + p.next.length, 0);
});

test('LATER shows only the shallowest unaddressed subtree root', () => {
  const m = parse([
    'outcome: O',
    '  Big need',
    '    Sub-need one',
    '      Deeper need',
    '    Sub-need two',
  ].join('\n'));
  const p = project(m);
  assert.deepEqual(labels(p.later), ['Big need']);
});

test('an addressed child rescues ancestors; unaddressed siblings still LATER', () => {
  const m = parse([
    'outcome: O',
    '  Big need',
    '    Addressed sub',
    '      Fix [delivering]',
    '    Ignored sub',
  ].join('\n'));
  const p = project(m);
  assert.deepEqual(labels(p.later), ['Ignored sub']);
});

test('shipped and parked appear on no roadmap column; dimmed in OST', () => {
  const m = parse('outcome: O\n  Need\n    Done thing [shipped]\n    Paused thing [parked]\n    Live thing [delivering]');
  const p = project(m);
  assert.deepEqual(labels(p.now), ['Live thing']);
  assert.equal(p.next.length + p.later.length, 0);
  assert.equal(p.ost.dimmed.size, 2);
});

test('NO WHY: solutions with no opportunity ancestor', () => {
  const m = parse('outcome: O\n  Orphan fix [delivering]\n  Real need\n    Justified fix [delivering]');
  const p = project(m);
  assert.deepEqual(labels(p.noWhy), ['Orphan fix']);
  assert.ok(!labels(p.noWhy).includes('Justified fix'));
});

test('UNTESTED BET: all assumptions untested, or none at all', () => {
  const m = parse([
    'outcome: O',
    '  Need',
    '    No assumptions [delivering]',
    '    All untested [testing]',
    '      ? belief one',
    '      ? belief two [untested]',
    '    Partly tested [testing]',
    '      ? belief [holds]',
    '      ? other belief',
  ].join('\n'));
  const p = project(m);
  const badge = label => {
    const entry = [...p.audits.entries()].find(([n]) => n.label === label);
    return entry ? entry[1] : [];
  };
  assert.ok(badge('No assumptions').includes('UNTESTED BET'));
  assert.ok(badge('All untested').includes('UNTESTED BET'));
  assert.ok(!badge('Partly tested').includes('UNTESTED BET'));
});

test('BROKEN ASSUMPTION beats UNTESTED BET and applies to committed solutions', () => {
  const m = parse('outcome: O\n  Need\n    Shaky [delivering]\n      ? core belief [broken]\n      ? other [untested]');
  const p = project(m);
  const badges = [...p.audits.values()][0];
  assert.deepEqual(badges, ['BROKEN ASSUMPTION']);
});

test('candidates and parked solutions get no audit badges', () => {
  const m = parse('outcome: O\n  Need\n    Idea [candidate]\n    Shelved [parked]\n      ? old belief [broken]');
  const p = project(m);
  assert.equal(p.audits.size, 0);
});

test('lanes: first-level opportunities; multi-outcome prefixes; breadcrumbs', () => {
  const m = parse([
    'outcome: Retention',
    '  Forgetting',
    '    Deep need',
    '      Reminders [testing]',
    'outcome: Revenue',
    '  Pricing confusion',
    '    Clearer tiers [delivering]',
  ].join('\n'));
  const p = project(m);
  const rem = p.next.find(x => x.node.label === 'Reminders');
  assert.equal(rem.lane, 'Retention — Forgetting');
  assert.equal(rem.breadcrumb, 'Deep need');
  const tiers = p.now.find(x => x.node.label === 'Clearer tiers');
  assert.equal(tiers.lane, 'Revenue — Pricing confusion');
  assert.equal(tiers.breadcrumb, 'Pricing confusion');
});

test('single outcome: lanes without outcome prefix', () => {
  const m = parse('outcome: O\n  Need\n    Fix [delivering]');
  const p = project(m);
  assert.equal(p.now[0].lane, 'Need');
});

test('unaddressed opportunities marked for the OST view', () => {
  const m = parse('outcome: O\n  Addressed\n    Fix [delivering]\n  Bare need');
  const p = project(m);
  assert.equal(p.ost.unaddressed.size, 1);
  assert.equal([...p.ost.unaddressed][0].label, 'Bare need');
});
