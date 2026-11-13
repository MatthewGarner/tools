/* Request sequencing for a simulation that runs off the main thread. Pure: no DOM, no Worker.
   The page hands in how to start a worker (`spawn`), how to run the same function inline (`runSync`) and what to do with an
   answer. The one rule that keeps a stale answer from ever painting: every request gets the next number, and an answer is
   used only if it carries the number of the request that is current. Everything else follows from it:
   - the latest request wins; a request for the key already in flight is not repeated;
   - a newer request abandons the one in flight: the worker is replaced so the new run never waits behind the old one;
   - a MODEL error (the engine threw on this document) is an answer like any other: it does not disable the worker;
   - a worker failure (it would not start, an error event, silence past the timeout) does: the in-flight request and every
     later one run inline, so the page degrades to what it did before workers. */
export function createSimSequencer({spawn, runSync, onResult, onError, timeoutMs = 20000, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout}){
  let worker = null, alive = true;
  let seq = 0, flight = null, timer = null;   // flight: {key, payload, id} for the request awaiting its answer
  const stop = () => { clearTimer(timer); timer = null; };
  const end = w => { if(w && w.terminate) try{ w.terminate(); }catch(e){} };
  function start(){
    let w = null;
    try{ w = spawn({message: data => receive(w, data), failure: () => failed(w)}); }catch(e){ w = null; }
    if(!w) alive = false;
    return w;
  }
  function inline(key, payload, id){
    let result;
    try{ result = runSync(payload); }
    catch(e){ flight = null; onError(key, String((e && e.message) || e), id); return; }
    flight = null;
    onResult(key, result, id);
  }
  function receive(from, data){
    if(from !== worker || !flight || !data || data.reqId !== seq) return;   // superseded, abandoned or from a replaced worker
    stop();
    const {key, id} = flight;
    flight = null;
    if(data.error !== undefined) onError(key, String(data.error), id);   // a model error: the worker is fine
    else onResult(key, data.result, id);
  }
  function failed(from){
    if(from !== worker) return;             // an abandoned worker's last words
    stop(); alive = false; worker = null; end(from);
    if(flight){ const {key, payload, id} = flight; inline(key, payload, id); }
  }
  /* the run in flight is no longer wanted: its number is retired and its worker replaced, so the next run never queues behind it */
  function abandon(){
    stop(); flight = null;
    const w = worker; worker = null; end(w);
    if(alive) worker = start();
  }
  worker = start();
  return {
    /* Ask for `payload`, answered under `key`. Returns the request's number. May answer before it returns (no worker). */
    request(key, payload){
      if(flight && flight.key === key) return flight.id;   // already running for exactly this
      if(flight) abandon();
      const id = ++seq;
      flight = {key, payload, id};
      if(!worker){ inline(key, payload, id); return id; }
      try{ worker.postMessage({payload, reqId: id}); }
      catch(e){ failed(worker); return id; }
      const sent = worker;
      timer = setTimer(() => failed(sent), timeoutMs);
      return id;
    },
    /* The page no longer wants whatever is running. */
    cancel(){ if(flight){ abandon(); seq++; } },
    inFlight: () => flight ? flight.key : null,
    workerAlive: () => !!worker,
  };
}
