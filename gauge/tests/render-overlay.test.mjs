import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderOverlay} from '../render-overlay.js';
import {sessionStats} from '../engine.js';
import {parse} from '../parse.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
};
const M = parse('title: Q3 review\nnames: on\nShip by Q3 :: prob\nWeeks to migrate :: range weeks');
const RESP = [
  {values: [80, [4, 8]], name: 'Ana'},
  {values: [75, [6, 12]], name: 'Ben'},
  {values: [20, [5, 9]], name: 'Cy'},
  {values: [15, [30, 50]], name: 'Di'},
];
const svg = () => renderOverlay(M, sessionStats(M, RESP), ctx);

test('valid SVG with integer dimensions', () => {
  const s = svg();
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="960" height="\d+"/);
  assert.ok(s.endsWith('</svg>'));
});

test('header carries title, verdict, response count', () => {
  const s = svg();
  assert.ok(s.includes('Q3 review'));
  assert.ok(s.includes('discuss'));            // verdict names discussion items
  assert.ok(s.includes('4 responses'));
});

test('headlines and pills present per question', () => {
  const s = svg();
  assert.ok(s.includes('Split room:'));
  assert.ok(s.includes('DISCUSS'));
  assert.ok(s.includes('median'));
});

test('named rows are labelled; anonymous are not', () => {
  assert.ok(svg().includes('Ana'));
  const anon = parse('Weeks :: range weeks');
  const s = renderOverlay(anon, sessionStats(anon, RESP.map(r => ({values: [r.values[1]]}))), ctx);
  assert.ok(!s.includes('Ana'));
});

test('overlap band labelled when a common zone exists', () => {
  const m = parse('Weeks :: range weeks');
  const agree = [{values: [[4, 8]]}, {values: [[5, 9]]}, {values: [[3, 7]]}];
  const s = renderOverlay(m, sessionStats(m, agree), ctx);
  assert.ok(s.includes('common ground'));
  assert.ok(s.includes('ALIGNED'));
});

test('empty and single-response panels degrade to a message', () => {
  const m = parse('A :: prob');
  const s0 = renderOverlay(m, sessionStats(m, []), ctx);
  assert.ok(s0.includes('No responses yet.'));
  const s1 = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(s1.includes('Only one response'));
});

test('question text and names are escaped', () => {
  const m = parse('a <b> :: prob');
  const s = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(!s.includes('<b>'));
});

test('header pluralizes the response count', () => {
  const m = parse('A :: prob');
  const one = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(one.includes('1 response ·'));       // singular, not "1 responses"
  assert.ok(!one.includes('1 responses'));
  const two = renderOverlay(m, sessionStats(m, [{values: [50]}, {values: [60]}]), ctx);
  assert.ok(two.includes('2 responses ·'));
});

test('deterministic: same inputs, identical string', () => {
  assert.equal(svg(), svg());
});
