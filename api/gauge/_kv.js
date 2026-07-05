/* KV access for the gauge relay: Upstash REST + an in-memory twin for tests and dev.
   Interface: kv.pipeline([[cmd, key, ...args], ...]) -> [results]; HGETALL is flat. */

export function upstashKv(env = process.env){
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if(!url || !token) throw new Error('Upstash env vars missing (UPSTASH_REDIS_REST_URL/TOKEN)');
  return {
    async pipeline(cmds){
      const res = await fetch(url + '/pipeline', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
        body: JSON.stringify(cmds),
      });
      if(!res.ok) throw new Error('kv http ' + res.status);
      const out = await res.json();
      return out.map(r => {
        if(r.error) throw new Error('kv: ' + r.error);
        return r.result;
      });
    },
  };
}

export function memoryKv(now = Date.now){
  const store = new Map();   // key -> {fields: Map, expiresAt: number|null}
  const live = key => {
    const e = store.get(key);
    if(!e) return null;
    if(e.expiresAt !== null && now() > e.expiresAt){ store.delete(key); return null; }
    return e;
  };
  const ensure = key => {
    let e = live(key);
    if(!e){ e = {fields: new Map(), expiresAt: null}; store.set(key, e); }
    return e;
  };
  function run([cmd, key, ...args]){
    switch(cmd){
      case 'HSETNX': {
        const e = ensure(key);
        if(e.fields.has(args[0])) return 0;
        e.fields.set(args[0], String(args[1]));
        return 1;
      }
      case 'HSET': {
        const e = ensure(key);
        let added = 0;
        for(let i = 0; i < args.length; i += 2){
          if(!e.fields.has(args[i])) added++;
          e.fields.set(args[i], String(args[i + 1]));
        }
        return added;
      }
      case 'HGET': {
        const e = live(key);
        return e && e.fields.has(args[0]) ? e.fields.get(args[0]) : null;
      }
      case 'HGETALL': {
        const e = live(key);
        const flat = [];
        if(e) for(const [f, v] of e.fields) flat.push(f, v);
        return flat;
      }
      case 'EXPIRE': {
        const e = live(key);
        if(!e) return 0;
        if(args[1] === 'NX' && e.expiresAt !== null) return 0;
        e.expiresAt = now() + args[0] * 1000;
        return 1;
      }
      case 'INCR': {
        const e = ensure(key);
        const v = (Number(e.fields.get('#')) || 0) + 1;
        e.fields.set('#', String(v));
        return v;
      }
      case 'DEL': {
        return live(key) ? (store.delete(key), 1) : 0;
      }
      default: throw new Error('memoryKv: unsupported ' + cmd);
    }
  }
  return {pipeline: async cmds => cmds.map(run), _store: store};
}

let memo = null;
export function getKv(){
  if(!memo) memo = process.env.GAUGE_KV === 'memory' ? memoryKv() : upstashKv();
  return memo;
}
