import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolveBoardWindow, boardCapacityFor} from '../board-window.js';
import {renderBoardLive} from '../render-board.js';

const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',err:'#b33',
  status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};

const model = parse(`horizons: A, B, C, D, E
C
Core: shaped work
E
Core: later work`);

test('defaults the dense Board window to focus or first occupied horizon', () => {
  assert.deepEqual(resolveBoardWindow(model).indices, [2,3,4]);
  assert.deepEqual(resolveBoardWindow({...model, focus:'B'}).indices, [1,2,3]);
});

test('clamps URL view state after a horizon edit', () => {
  assert.deepEqual(resolveBoardWindow(model, 99).indices, [2,3,4]);
  assert.deepEqual(resolveBoardWindow(parse('horizons: A, B\nA\nCore: one'), 5).indices, [0,1]);
});

test('Board capacity is adaptive, so a five-quarter canvas stays whole when it fits', () => {
  assert.equal(boardCapacityFor(908, 5), 3);
  assert.equal(boardCapacityFor(1366, 5), 5);
  assert.equal(boardCapacityFor(1800, 8), 7);
});

test('the live Board window keeps source horizon targets for direct manipulation', () => {
  const svg = renderBoardLive(model, {colors, measure:text => String(text).length * 7, edit:true,
    boardWindow: resolveBoardWindow(model), today:'2026-08-14'});
  assert.match(svg, />C</);
  assert.match(svg, />E</);
  assert.doesNotMatch(svg, />A</);
  assert.match(svg, /data-hdrop="2"/);
  assert.match(svg, /data-hdrop="4"/);
});
