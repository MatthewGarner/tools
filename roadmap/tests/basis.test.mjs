import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyWorld, parse} from '../parse.js';
import {CONFIG_KEYS, setLane} from '../edit-targets.js';

const basis = line => parse(`${line}\nNOW\nCore: Work`);
const invalid = (value, pattern = /basis/i) => {
  const model = basis(`basis: ${value}`);
  assert.equal(model.basis, null, value);
  assert.equal(model.warnings.filter(w => /basis/i.test(w)).length, 1, value);
  assert.match(model.warnings.find(w => /basis/i.test(w)), pattern, value);
  assert.equal(model.items.length, 1, 'an invalid basis must not stop the roadmap parsing');
  return model;
};

test('basis is absent by default', () => {
  const model = parse('NOW\nCore: Work');
  assert.equal(model.basis, null);
  assert.equal(model.warnings.length, 0);
});

test('basis parses answered-only, assumed-only and mixed ledgers with source line', () => {
  assert.deepEqual(basis('basis: paths "Growth decisions"; answered pricing=yes@2026-08-03').basis, {
    source:'Growth decisions', answered:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
    assumed:[], srcLine:0,
  });
  assert.deepEqual(basis('basis: paths "Growth decisions"; assumed groups=no@2026-08-12').basis, {
    source:'Growth decisions', answered:[], assumed:[{key:'groups', direction:'no', date:'2026-08-12'}],
    srcLine:0,
  });
  assert.deepEqual(parse([
    'title: Delivery projection',
    'basis: paths "Growth decisions"; assumed groups=no@2026-08-12; answered pricing=yes@2026-08-03, retention=no@2026-08-09',
    'NOW', 'Core: Work',
  ].join('\n')).basis, {
    source:'Growth decisions',
    answered:[{key:'pricing', direction:'yes', date:'2026-08-03'}, {key:'retention', direction:'no', date:'2026-08-09'}],
    assumed:[{key:'groups', direction:'no', date:'2026-08-12'}], srcLine:1,
  });
});

test('basis accepts harmless human provenance and preserves authored key case', () => {
  const model = basis('basis: paths " Growth & retention <review> "; answered Pricing=yes@2024-02-29');
  assert.equal(model.warnings.length, 0);
  assert.equal(model.basis.source, ' Growth & retention <review> ');
  assert.equal(model.basis.answered[0].key, 'Pricing');
});

test('basis invalidates atomically on malformed source provenance', () => {
  for(const value of [
    'paths ""; answered pricing=yes@2026-08-03',
    'paths "   "; answered pricing=yes@2026-08-03',
    'path "Growth decisions"; answered pricing=yes@2026-08-03',
    'paths Growth decisions; answered pricing=yes@2026-08-03',
    'paths "Growth // decisions"; answered pricing=yes@2026-08-03',
    'paths "Growth; decisions"; answered pricing=yes@2026-08-03',
    'paths "Growth\tdecisions"; answered pricing=yes@2026-08-03',
    'paths "Growth "decisions""; answered pricing=yes@2026-08-03',
  ]) invalid(value);
});

test('basis requires at least one complete ledger entry', () => {
  for(const value of [
    'paths "Growth decisions"', 'paths "Growth decisions";',
    'paths "Growth decisions"; answered', 'paths "Growth decisions"; answered ',
    'paths "Growth decisions"; answered; assumed groups=no@2026-08-12',
    'paths "Growth decisions"; assumed',
  ]) invalid(value);
});

test('basis rejects duplicate and unknown clauses without keeping a partial ledger', () => {
  for(const value of [
    'paths "Growth decisions"; answered pricing=yes@2026-08-03; answered retention=no@2026-08-04',
    'paths "Growth decisions"; assumed pricing=yes@2026-08-03; assumed retention=no@2026-08-04',
    'paths "Growth decisions"; selected pricing=yes@2026-08-03',
    'paths "Growth decisions"; answered pricing=yes@2026-08-03;; assumed groups=no@2026-08-12',
  ]) invalid(value);
});

test('basis rejects duplicate keys across and within ledgers, case-insensitively', () => {
  for(const value of [
    'paths "Growth decisions"; answered pricing=yes@2026-08-03, pricing=no@2026-08-04',
    'paths "Growth decisions"; answered Pricing=yes@2026-08-03; assumed pricing=no@2026-08-04',
    'paths "Growth decisions"; assumed groups=no@2026-08-12, GROUPS=yes@2026-08-13',
  ]) invalid(value, /duplicate/i);
});

test('basis rejects malformed keys, directions, dates and delimiters atomically', () => {
  for(const value of [
    'paths "Growth decisions"; answered price_share=yes@2026-08-03',
    'paths "Growth decisions"; answered pricing=won@2026-08-03',
    'paths "Growth decisions"; answered pricing=yes/2026-08-03',
    'paths "Growth decisions"; answered pricing=yes@2026-8-03',
    'paths "Growth decisions"; answered pricing=yes@2026-02-29',
    'paths "Growth decisions"; answered pricing=yes@2026-04-31',
    'paths "Growth decisions"; answered pricing=yes@0000-01-01',
    'paths "Growth decisions"; answered pricing=yes@2026-08-03,',
    'paths "Growth decisions"; answered ,pricing=yes@2026-08-03',
    'paths "Growth decisions"; answered pricing=yes@2026-08-03 extra',
  ]) invalid(value);
});

test('basis refuses an overlong header rather than pushing fixed deck content below its footer', () => {
  invalid('paths "' + 'S'.repeat(81) + '"; answered pricing=yes@2026-08-03', /too long/i);
  invalid('paths "Growth"; answered ' + 'k'.repeat(33) + '=yes@2026-08-03', /too long/i);
  const entries = Array.from({length:9}, (_, i) => 'k' + i + '=yes@2026-08-03').join(', ');
  invalid('paths "Growth"; answered ' + entries, /at most 8/i);
});

test('basis does not treat trailing comments as disposable provenance', () => {
  invalid('paths "Growth decisions"; answered pricing=yes@2026-08-03 // accepted');
});

test('multiple basis lines invalidate the whole datum and never last-win or recover', () => {
  const model = parse([
    'basis: paths "First"; answered pricing=yes@2026-08-03',
    'basis: paths "Second"; assumed groups=no@2026-08-12',
    'NOW', 'Core: Work',
  ].join('\n'));
  assert.equal(model.basis, null);
  assert.equal(model.warnings.filter(w => /basis/i.test(w)).length, 1);
  assert.match(model.warnings[0], /duplicate/i);

  const noRecovery = parse([
    'basis: paths "Broken"; answered pricing=maybe@2026-08-03',
    'basis: paths "Valid-looking"; answered pricing=yes@2026-08-03',
    'NOW', 'Core: Work',
  ].join('\n'));
  assert.equal(noRecovery.basis, null);
  assert.equal(noRecovery.warnings.filter(w => /basis/i.test(w)).length, 1);
});

test('basis missing its colon gets the normal config hint and is never filed as work', () => {
  const model = parse('basis paths "Growth"; answered pricing=yes@2026-08-03\nNOW\nCore: Work');
  assert.equal(model.basis, null);
  assert.match(model.warnings[0], /did you mean "basis:"/);
  assert.equal(model.items.length, 1);
});

test('basis survives a Roadmap-local what-if projection unchanged', () => {
  const model = parse([
    'basis: paths "Growth"; answered pricing=yes@2026-08-03',
    'NOW',
    'Core: Probe [bet: local-fork]',
    'NEXT',
    'Core: Expansion [if local-fork]',
  ].join('\n'));
  const projected = applyWorld(model, {'local-fork':'won'});
  assert.deepEqual(projected.basis, model.basis);
  assert.notEqual(projected, model);
});

test('basis remains a config key below a horizon and cannot be used as an editable lane', () => {
  const model = parse('NOW\nbasis: paths "Growth"; answered pricing=yes@2026-08-03\nCore: Work');
  assert.equal(model.basis.source, 'Growth');
  assert.equal(model.items.length, 1);
  assert.match(model.warnings[0], /read as the basis: setting, not an item/);

  assert.ok(CONFIG_KEYS.test('basis'));
  const text = 'NOW\nCore: Work';
  assert.equal(setLane(text, 1, 'basis'), text, 'lane rewrite must refuse config collisions');
});
