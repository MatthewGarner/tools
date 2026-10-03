/* Frequency trace scene: simulation result → display semantics.
   Keeping this model separate means the live canvas and SVG export share the
   same range, annotations, and cursor rules. */
import {F0, simulate} from './engine.js';

const UFLS = 48.8;
const BAND = {low: 49.8, high: 50.2, frequency: F0, label: '50 Hz'};

const activeBattery = p => p.drMw > 0 || p.dmMw > 0 || p.dcMw > 0 || p.eGfm > 0;

export function buildTraceScene(result, params){
  const end = result.t[result.t.length - 1];
  // Compute the counterfactual once. It is deliberately absent for an
  // already-unassisted run: there is no useful comparison to draw.
  const ghostResult = activeBattery(params)
    ? simulate({...params, drMw: 0, dmMw: 0, dcMw: 0, eGfm: 0})
    : null;
  const lowNadir = ghostResult ? Math.min(result.nadir.f, ghostResult.nadir.f) : result.nadir.f;
  const frequency = {min: Math.min(lowNadir - 0.4, 48.5), max: 50.3};
  const time = {start: 0, end};
  const gridTicks = Array.from({length: Math.max(0, Math.floor(frequency.max) - Math.ceil(frequency.min) + 1)},
    (_, i) => ({frequency: Math.floor(frequency.max) - i, visibility: 'static'}));
  const scene = {
    time,
    frequency: {
      ...frequency,
      gridTicks,
      nominalBand: {...BAND, visibility: 'static'},
      threshold: {frequency: UFLS, label: '48.8 Hz — load shed', visibility: 'static'},
    },
    trace: {points: result.t.map((time, i) => ({time, frequency: result.f[i]})), visibility: 'progressive'},
    nadir: {time: result.nadir.t, frequency: result.nadir.f,
      label: `nadir ${result.nadir.f.toFixed(2)} Hz`, visibility: 'after-trace'},
    axes: {start: {time: 0, label: '0 s'}, end: {time: end, label: `${Math.round(end)} s`}, visibility: 'static'},
  };
  // `domain` is a convenient named handle, not a second domain to keep aligned.
  scene.domain = {time: scene.time, frequency: scene.frequency};
  if(ghostResult){
    scene.ghost = {
      points: ghostResult.t.map((time, i) => ({time, frequency: ghostResult.f[i]})),
      nadir: {time: ghostResult.nadir.t, frequency: ghostResult.nadir.f},
      label: 'same grid, no battery',
      visibility: 'static',
    };
  }
  if(result.rocof > 0.01){
    const t = Math.min(Math.min(1.0, F0 - frequency.min - 0.2) / result.rocof, end * 0.32);
    scene.rocof = {from: {time: 0, frequency: F0}, to: {time: t, frequency: F0 - result.rocof * t},
      label: `RoCoF ${result.rocof.toFixed(2)} Hz/s`, visibility: 'static'};
  }
  return scene;
}
