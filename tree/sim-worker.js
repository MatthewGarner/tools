/* Off-main-thread evaluation for /tree: a thin shell round the untouched, seeded engine, so the answer is the one the page used to
   compute inline. A tree the engine cannot evaluate answers {error, reqId} instead of throwing: a model error is not a worker
   failure and must not disable the worker. */
import {runEvaluation} from './eval-wire.js';
self.onmessage = ({data: {payload, reqId}}) => {
  try{ self.postMessage({result: runEvaluation(payload), reqId}); }
  catch(e){ self.postMessage({error: String((e && e.message) || e), reqId}); }
};
