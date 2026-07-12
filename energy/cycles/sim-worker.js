/* Off-main-thread Monte Carlo for /cycles. Thin shell around the untouched,
   seeded engine — same output as an inline call. Plain structured clone (the
   result is ~1-3KB of reduced summaries; the big matrices never leave
   simulate(), so there is nothing worth transferring). */
import {simulate} from './engine.js';
self.onmessage = ({data: {model, seed, n, reqId}}) => {
  self.postMessage({out: simulate(model, {seed, n}), reqId});
};
