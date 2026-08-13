/* Goldratt-style dependent-dice game. Each station has the same average local
   capacity, but its realised roll is passed to the next station through a finite
   buffer. This is an intuition pump about dependency + variation, not a forecast. */
import {mulberry32} from '../assets/series.js';

export function diceGame({stations = 5, days = 30, seed = 0xD1CE} = {}){
  const n = Math.max(2, Math.min(8, Math.round(stations)));
  const horizon = Math.max(1, Math.min(90, Math.round(days)));
  const rand = mulberry32(seed >>> 0);
  const buffers = Array(n - 1).fill(0), rolls = Array(n).fill(0), processed = Array(n).fill(0), daily = [];
  let released = 0, delivered = 0, peakWip = 0;
  for(let day = 0; day < horizon; day++){
    const cap = Array.from({length: n}, () => 1 + Math.floor(rand() * 6));
    cap.forEach((v, i) => { rolls[i] += v; });
    const move = Array(n).fill(0);
    move[0] = cap[0]; released += move[0];
    for(let i = 1; i < n; i++) move[i] = Math.min(cap[i], buffers[i - 1]);
    // Apply all moves together: a stage cannot consume work produced later that day.
    for(let i = 0; i < n - 1; i++) buffers[i] += move[i] - move[i + 1];
    processed.forEach((_, i) => { processed[i] += move[i]; });
    delivered += move[n - 1];
    peakWip = Math.max(peakWip, buffers.reduce((a, v) => a + v, 0));
    daily.push({day: day + 1, delivered: move[n - 1], wip: buffers.reduce((a, v) => a + v, 0)});
  }
  return {stations: n, days: horizon, released, delivered, peakWip, finalWip: buffers.reduce((a, v) => a + v, 0),
    averageRoll: 3.5, realisedAverage: rolls.map(v => v / horizon), processed, buffers, daily};
}
