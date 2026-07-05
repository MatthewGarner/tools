/* Fetch wrapper + facilitator poll loop. Thin and mockable; no DOM. */

export function createRelay({base = '/api/gauge', fetchFn} = {}){
  const f = fetchFn || ((...a) => fetch(...a));
  async function call(method, path, body){
    try{
      const res = await f(base + path, {
        method,
        headers: body ? {'Content-Type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try{ data = await res.json(); }catch(e){}
      return {ok: res.ok, status: res.status, data};
    }catch(e){
      return {ok: false, status: 0, data: null};
    }
  }
  return {
    create: (id, keyHash, names) => call('POST', '', {id, keyHash, names}),
    submit: (id, payload) => call('PUT', '/' + id + '/response', payload),
    status: id => call('GET', '/' + id),
    reveal: (id, key) => call('POST', '/' + id + '/reveal', {key}),
    end: (id, key) => call('POST', '/' + id + '/end', {key}),
  };
}

/* 5s base, ±20% jitter, exponential backoff on failures, capped at 60s. */
export function pollDelay(baseMs, failures, rand = Math.random){
  const backed = Math.min(baseMs * Math.pow(2, failures), 60000);
  return Math.round(backed * (0.8 + rand() * 0.4));
}

export function startPoll({tick, onUpdate, onError, baseMs = 5000,
  rand = Math.random, timer = setTimeout, clear = clearTimeout}){
  let stopped = false, failures = 0, handle = null;
  async function loop(){
    if(stopped) return;
    try{
      const r = await tick();
      failures = 0;
      if(onUpdate(r) === false){ stopped = true; return; }
    }catch(e){
      failures++;
      if(onError) onError(failures, e);
    }
    if(!stopped) handle = timer(loop, pollDelay(baseMs, failures, rand));
  }
  handle = timer(loop, 0);
  return {stop(){ stopped = true; clear(handle); }};
}

export const randomHex = bytes =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');

export async function sha256hex(s){
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
