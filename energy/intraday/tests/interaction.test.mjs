import test from 'node:test';
import assert from 'node:assert/strict';
import {calloutOwnsFocus, findPlantTarget, calloutPosition} from '../interaction.js';

test('callout focus ownership includes the popover and its descendants only', () => {
  const child = {};
  const pop = {contains: node => node === child};
  assert.equal(calloutOwnsFocus(pop, pop), true);
  assert.equal(calloutOwnsFocus(pop, child), true);
  assert.equal(calloutOwnsFocus(pop, {}), false);
});

test('fresh plant lookup restores by stable name after an SVG swap', () => {
  const plants = [{dataset: {plant: 'Nuclear'}}, {dataset: {plant: 'Gas CCGT'}}];
  const root = {querySelectorAll: () => plants};
  assert.equal(findPlantTarget(root, 'Gas CCGT'), plants[1]);
  assert.equal(findPlantTarget(root, 'Old removed plant'), null);
});

test('callout flips above a bottom-edge plant and clamps horizontally', () => {
  assert.deepEqual(calloutPosition({left: 390, top: 380, bottom: 410}, {width: 160, height: 90}, {width: 500, height: 460}),
    {x: 332, y: 284});
});
