import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutRoadmap, presentationStrip} from '../layout.js';
import {renderDeck} from '../render-deck.js';

const measure = text => String(text || '').length * 7;
const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',
  err:'#b33',status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};

const many = parse(`title: A deliberately long roadmap title that needs measured wrapping before the board begins and keeps going until the second measured line is unquestionably required
horizons: A, B, C, D, E, F
A
Core: a
B
Core: b
C
Core: c
D
Core: d
E
Core: e
F
Core: f`);

test('native layout is exhaustive and retains all authored horizons', () => {
  const layout = layoutRoadmap(many, {kind:'native', measure, width:900});
  assert.equal(layout.model, many, 'native is a projection-free full artefact');
  assert.equal(layout.model.horizons.length, 6);
  assert.equal(layout.model.items.length, 6);
  assert.equal(layout.title.lines.length, 2);
  assert.ok(layout.bounds.minWidth > 1000);
});

test('presentation chooses a focus strip, otherwise the first non-empty strip', () => {
  const focused = {...many, focus:'E'};
  assert.deepEqual(presentationStrip(focused).indices, [3,4,5]);
  const sparse = parse('horizons: A, B, C, D, E\nD\nCore: only');
  assert.deepEqual(presentationStrip(sparse).indices, [2,3,4]);
});

test('presentation remaps the selected strip and states selection plus remainder', () => {
  const layout = layoutRoadmap({...many, focus:'E'}, {kind:'presentation', measure});
  assert.deepEqual(layout.model.horizons, ['D','E','F']);
  assert.deepEqual(layout.model.items.map(i => i.h), [0,1,2]);
  assert.equal(layout.selection.omittedItems, 3);
  assert.match(layout.selection.line, /SHOWING 3 OF 6 HORIZONS · 3 OF 6 ITEMS · 3 CONTINUE/);
});

test('every fixed deck style carries the same visible selection contract', () => {
  for(const style of ['board','register','focus','grid']){
    const svg = renderDeck({...many, style}, {measure, colors, today:'2026-08-04'});
    assert.match(svg, /width="1920" height="1080"/);
    assert.ok(svg.includes('SHOWING 3 OF 6 HORIZONS'));
    assert.ok(svg.includes('3 CONTINUE'));
  }
});
