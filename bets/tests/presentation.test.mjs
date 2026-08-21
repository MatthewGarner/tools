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
  assert.match(svg, /INDEPENDENT BASELINE/);
  assert.match(svg, /SHARED-OUTCOME STRESS/);
  assert.match(svg, /MEDIAN OUTCOME/);
  assert.doesNotMatch(svg, /NET EV/);
  assert.match(svg, /OMITTED MATERIAL EXCEPTIONS · NO KILL B01–B03/);
  assert.match(svg, /ALLOCATION FIELD · FULL DETAIL: DOWNLOAD SVG/);
  assert.match(svg, /outside the presentation selection/);
});

test('presentation carries only ranked selections, no edit chrome or model mutation', () => {
  const svg = renderBetsPresentation(model, sim, {colors: COLORS, measure});
  for(const name of ['Bet 9', 'Bet 8', 'Bet 7', 'Bet 6', 'Bet 5', 'Bet 4']) assert.ok(svg.includes(name));
  for(const name of ['Bet 1', 'Bet 2', 'Bet 3']) assert.ok(!svg.includes('>' + name + '<'));
  assert.ok(!svg.includes('data-edit='));
  assert.equal('id' in model.groups[0].bets[0], false);
});

test('presentation names an omitted no-kill and P50-loss exception in-plane', () => {
  const source = `title: Exceptions\nunit: £k\nG\n` +
    Array.from({length: 6}, (_, i) => `  Range ${i + 1}: stake 0-110, odds 60%, payoff 300\n    kill: stop range ${i + 1}`).join('\n') +
    '\n  Concentrated loss: stake 100, odds 0%, payoff 1';
  const m = parse(source), s = simulate(m);
  const svg = renderBetsPresentation(m, s, {colors: COLORS, measure});
  assert.match(svg, /OMITTED MATERIAL EXCEPTIONS · NO KILL B07 · P50 LOSS B07/);
});

test('presentation names a high-concentration portfolio exception even when its card is selected', () => {
  const source = `title: Concentration\nunit: £k\nG\n` +
    Array.from({length: 6}, (_, i) => `  Small ${i + 1}: stake 1, odds 100%, payoff 10\n    kill: stop small ${i + 1}`).join('\n') +
    '\n  Carrier: stake 100, odds 0%, payoff 1\n    kill: stop carrier';
  const m = parse(source), s = simulate(m);
  const svg = renderBetsPresentation(m, s, {colors: COLORS, measure});
  assert.match(svg, /PORTFOLIO EXCEPTION · HIGH CONCENTRATION B07/);
});

test('concentration receipt uses scored identity with an invalid giant and duplicate names', () => {
  const m = parse(`G
  Sound: stake 1000, odds 150%, payoff 3000
  Sound: stake 80, odds 50%, payoff 100
  Sound: stake 20, odds 50%, payoff 100`);
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  assert.match(svg, /TOTAL STAKE 100/);
  assert.match(svg, /PORTFOLIO EXCEPTION · HIGH CONCENTRATION B02/);
  assert.match(svg, /NOT SCORED · B01 Sound/);
});

test('unscored bets never enter ranked cards or stake totals, but remain disclosed', () => {
  const m = parse(`title: Invalid mix\nunit: £k\nG
  Invalid giant: stake 1000, odds 150%, payoff 3000
  Sound: stake 10, odds 50%, payoff 40`);
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  assert.match(svg, /TOTAL STAKE 10 £k/);
  assert.match(svg, /NOT SCORED · B01 Invalid giant/);
  assert.match(svg, />Sound</);
  assert.doesNotMatch(svg, />Invalid giant</);
});

test('all-unscored Copy summary says unavailable rather than 0% safe', () => {
  const m = parse('G\n  Invalid: stake 10, odds 150%, payoff 30');
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  assert.match(svg, /NOT AVAILABLE/);
  assert.match(svg, /Add a scoreable bet/);
  assert.match(svg, /Correct invalid terms/);
  assert.match(svg, /NOT SCORED · B01 Invalid/);
  assert.doesNotMatch(svg, /P\(LOSES MONEY\) 0%/);
});

test('Copy PNG wraps a long authored title inside the header rather than clipping it', () => {
  const title = 'A deliberately long allocation review title whose full wording must remain legible in a presentation field';
  const m = parse(`title: ${title}\nG\n  Sound: stake 10, odds 50%, payoff 40`);
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  const lines = svg.match(/data-bets-title-line=""/g) || [];
  assert.ok(lines.length >= 2, 'the title should use measured presentation lines');
  for(const word of ['deliberately', 'wording', 'presentation']) assert.match(svg, new RegExp(word));
});

test('a wrapped Copy-PNG title moves the table rule with its measured header', () => {
  const m = parse('title: A deliberately long allocation review title whose full wording must remain legible in a presentation field\nG\n  Sound: stake 10, odds 50%, payoff 40');
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  const positionY = +(svg.match(/<text x="96" y="([\d.]+)"[^>]*>POSITION<\/text>/) || [])[1];
  const rules = [...svg.matchAll(/<line x1="96" y1="([\d.]+)" x2="1824"/g)].map(match => +match[1]);
  assert.ok(rules.includes(positionY + 14),
    'the table header’s separator must follow the shifted POSITION label');
});

test('Copy PNG admits only the ranked rows that fit above its portfolio-field reserve', () => {
  const long = 'A deliberately wordy position label that needs several measured lines in a projection-ready field';
  const kill = 'a deliberately wordy kill criterion that also needs enough room to prove the compact slide admission policy';
  const m = parse(`title: Dense portfolio\nG\n${Array.from({length: 6}, (_, i) =>
    `  ${long} ${i + 1}: stake ${100 - i}, odds 40-60%, payoff 80-160\n    kill: ${kill}`).join('\n')}`);
  const svg = renderBetsPresentation(m, simulate(m), {colors: COLORS, measure});
  const rows = [...svg.matchAll(/<g data-row="bet"[^>]*>([\s\S]*?)<\/g>/g)];
  const bodyBottom = Math.max(...rows.flatMap(row => [...row[1].matchAll(/ y="([\d.]+)"/g)].map(match => +match[1])));
  assert.ok(rows.length < 6, 'the plate should stop before its dense rows displace the portfolio evidence');
  assert.ok(bodyBottom <= 720, 'admitted rows reserve the lower portfolio field and factual footer');
  assert.match(svg, /FURTHER BETS IN FULL SVG/);
});
