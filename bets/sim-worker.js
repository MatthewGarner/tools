/* Off-main-thread simulation for /bets: a thin shell round the untouched, seeded engine, so the answer is the one the page used to
   compute inline. A portfolio the engine cannot simulate answers {error, reqId} instead of throwing: a model error is not a worker
   failure and must not disable the worker. */
import {runSimulations} from './sim-memo.js';
self.onmessage = ({data: {payload, reqId}}) => {
  try{ self.postMessage({result: runSimulations(payload), reqId}); }
  catch(e){ self.postMessage({error: String((e && e.message) || e), reqId}); }
};
