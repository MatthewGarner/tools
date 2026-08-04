import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderBetsPresentation} from '../render-presentation.js';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e',
  bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5'};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };

const src = `title: Portfolio presentation\nunit: £k\nG\n` +
  Array.from({length: 9}, (_, i) => `  Bet ${i + 1}: stake ${10 + i * 10}, odds 30-50%, payoff ${100 + i * 20}-${180 + i * 20}`).join('\n');
const model = parse(src), sim = simulate(model);

test('Copy render is a fixed 1920×1080 summary with selection and remainder in-plane', () => {
  const svg = renderBetsPresentation(model, sim, {colors: COLORS, measure});
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1920 1080"[^>]+width="1920" height="1080"/);
  assert.match(svg, /SELECTION/);
  assert.match(svg, /HIGHEST STAKE UPPER BOUND/);
  assert.match(svg, /6 SHOWN · 3 FURTHER BETS IN FULL SVG/);
  assert.match(svg, /PRESENTATION SUMMARY · FULL DETAIL: DOWNLOAD SVG/);
});

test('presentation carries only ranked selections, no edit chrome or model mutation', () => {
  const svg = renderBetsPresentation(model, sim, {colors: COLORS, measure});
  for(const name of ['Bet 9', 'Bet 8', 'Bet 7', 'Bet 6', 'Bet 5', 'Bet 4']) assert.ok(svg.includes(name));
  for(const name of ['Bet 1', 'Bet 2', 'Bet 3']) assert.ok(!svg.includes('>' + name + '<'));
  assert.ok(!svg.includes('data-edit='));
  assert.equal('id' in model.groups[0].bets[0], false);
});
