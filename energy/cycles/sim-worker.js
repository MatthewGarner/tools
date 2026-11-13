/* Off-main-thread Monte Carlo for /cycles. Thin shell around the untouched,
   seeded engine — same output as an inline call. Plain structured clone (the
   result is ~1-3KB of reduced summaries; the big matrices never leave
   simulate(), so there is nothing worth transferring).
   A model the engine cannot solve answers {error, reqId} instead of throwing: a model
   error is not a worker failure, and must not disable the worker (audit CYC-4). */
import {simulate, RUN} from './engine.js';
self.onmessage = ({data: {model, seed = RUN.seed, n = RUN.n, reqId}}) => {
  try{ self.postMessage({out: simulate(model, {seed, n}), reqId}); }
  catch(e){ self.postMessage({error: String((e && e.message) || e), reqId}); }
};
