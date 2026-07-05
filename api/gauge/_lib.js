/* Relay endpoint logic. Deliberately dumb: numbers and flags only, never questions.
   Every function takes a kv (pipeline interface) and returns {status, body}.
   Portability: node:crypto's createHash is the only Node-only API here — keep it that way
   (spec decision #8: Cloudflare Workers is the designated escape hatch). */
import {createHash} from 'node:crypto';

export const TTL_SECONDS = 86400;
export const RATE_LIMIT_PER_MIN = 30;
const ID_RE = /^[0-9a-f]{32}$/, HASH_RE = /^[0-9a-f]{64}$/, PID_RE = /^[0-9a-f]{16,32}$/;

export const sha256hex = s => createHash('sha256').update(s).digest('hex');
export const clientIp = req =>
  (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || 'local';

const key = id => 'gauge:' + id;
const bad = msg => ({status: 400, body: {error: msg}});
const gone = {status: 404, body: {error: 'session not found or expired'}};

function toObj(flat){
  const o = {};
  for(let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}

function validValues(values){
  if(!Array.isArray(values) || values.length < 1 || values.length > 20) return false;
  return values.every(v => v === null
    || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)
    || (Array.isArray(v) && v.length === 2 &&
        v.every(x => typeof x === 'number' && Number.isFinite(x)) && v[0] <= v[1]));
}

async function overLimit(kv, ip){
  const rl = 'gauge:rl:' + ip;
  const [count] = await kv.pipeline([['INCR', rl], ['EXPIRE', rl, 60, 'NX']]);
  return count > RATE_LIMIT_PER_MIN;
}

/* Anonymous cross-round identity: participants keep one pid (the write token);
   readers only ever see its truncated hash, so a `who` can't be used to submit. */
const whoOf = pid => sha256hex(pid).slice(0, 8);

function roundEntries(o, prefix){
  const fields = Object.keys(o).filter(f => f.startsWith(prefix)).sort();
  const entries = fields.map(f => ({...JSON.parse(o[f]), who: whoOf(f.slice(prefix.length))}));
  const answered = [];
  for(const e of entries) e.values.forEach((v, i) => {
    answered[i] = (answered[i] || 0) + (v === null ? 0 : 1);
  });
  for(let i = 0; i < answered.length; i++) answered[i] = answered[i] || 0;
  return {entries, answered};
}

function sessionView(flat){
  if(!flat || !flat.length) return null;
  const o = toObj(flat);
  if(!o.meta) return null;
  const meta = JSON.parse(o.meta);
  const r1 = roundEntries(o, 'r:');
  const r2 = roundEntries(o, 's:');
  return {meta, revealed: o.revealed === '1', entries: r1.entries, answered: r1.answered,
    round: o.round === '2' ? 2 : 1, revealed2: o.revealed2 === '1',
    entries2: r2.entries, answered2: r2.answered};
}

export async function createSession(kv, body, ip){
  if(await overLimit(kv, ip)) return {status: 429, body: {error: 'rate limited — try again shortly'}};
  if(!body || typeof body !== 'object') return bad('body');
  const {id, keyHash, names} = body;
  if(!ID_RE.test(String(id))) return bad('id must be 32 hex chars');
  if(!HASH_RE.test(String(keyHash))) return bad('keyHash must be a sha-256 hex digest');
  if(typeof names !== 'boolean') return bad('names must be boolean');
  const meta = JSON.stringify({keyHash, names, created: Date.now()});
  const [fresh] = await kv.pipeline([['HSETNX', key(id), 'meta', meta]]);
  if(fresh !== 1) return {status: 409, body: {error: 'session id already exists'}};
  await kv.pipeline([['HSET', key(id), 'revealed', '0'], ['EXPIRE', key(id), TTL_SECONDS]]);
  return {status: 200, body: {ok: true}};
}

export async function putResponse(kv, id, body, ip){
  if(await overLimit(kv, ip)) return {status: 429, body: {error: 'rate limited — try again shortly'}};
  if(!ID_RE.test(String(id))) return bad('id');
  if(!body || typeof body !== 'object') return bad('body');
  const {participantId, values, name} = body;
  if(!PID_RE.test(String(participantId))) return bad('participantId');
  if(!validValues(values)) return bad('values must be null | 0–100 | [low, high] with low ≤ high, max 20');
  const [metaRaw, revealed, round, revealed2] = await kv.pipeline([
    ['HGET', key(id), 'meta'], ['HGET', key(id), 'revealed'],
    ['HGET', key(id), 'round'], ['HGET', key(id), 'revealed2']]);
  if(!metaRaw) return gone;
  const inRound2 = round === '2';
  if(inRound2 ? revealed2 === '1' : revealed === '1')
    return {status: 409, body: {error: 'revealed — responses are locked'}};
  const meta = JSON.parse(metaRaw);
  const entry = {values};
  if(meta.names){
    if(typeof name !== 'string' || !name.trim() || name.trim().length > 40) return bad('name (1–40 chars) required in a named session');
    entry.name = name.trim();
  } else if(name !== undefined) return bad('this session is anonymous — no names accepted');
  /* EXPIRE rides along: keeps the window at one meeting-day from last activity
     and self-heals a session whose create-time EXPIRE was lost mid-create.
     Round 2 writes its own prefix — round-1 entries are never touched. */
  await kv.pipeline([['HSET', key(id), (inRound2 ? 's:' : 'r:') + participantId, JSON.stringify(entry)],
    ['EXPIRE', key(id), TTL_SECONDS]]);
  return {status: 200, body: {ok: true}};
}

export async function getSession(kv, id){
  if(!ID_RE.test(String(id))) return bad('id');
  const [flat] = await kv.pipeline([['HGETALL', key(id)]]);
  const s = sessionView(flat);
  if(!s) return gone;
  const body = {count: s.entries.length, answered: s.answered, revealed: s.revealed,
    names: s.meta.names, round: s.round};
  if(s.revealed) body.responses = s.entries;   // independence enforced here, not in the UI
  if(s.round === 2){
    body.count2 = s.entries2.length;
    body.answered2 = s.answered2;
    body.revealed2 = s.revealed2;
    if(s.revealed2) body.responses2 = s.entries2;   // same rule, round 2
  }
  return {status: 200, body};
}

/* Delphi second round: only after reveal 1; round-2 answers accumulate under their
   own prefix and stay private until reveal 2. */
export async function openRound2(kv, id, body){
  if(!ID_RE.test(String(id))) return bad('id');
  if(!body || !ID_RE.test(String(body.key))) return bad('key');
  const [metaRaw, revealed, round] = await kv.pipeline([
    ['HGET', key(id), 'meta'], ['HGET', key(id), 'revealed'], ['HGET', key(id), 'round']]);
  if(!metaRaw) return gone;
  if(sha256hex(body.key) !== JSON.parse(metaRaw).keyHash) return {status: 403, body: {error: 'bad facilitator key'}};
  if(round === '2') return {status: 200, body: {ok: true, round: 2}};
  if(revealed !== '1') return {status: 409, body: {error: 'reveal round 1 before opening round 2'}};
  await kv.pipeline([['HSET', key(id), 'round', '2'], ['HSET', key(id), 'revealed2', '0'],
    ['EXPIRE', key(id), TTL_SECONDS]]);
  return {status: 200, body: {ok: true, round: 2}};
}

export async function reveal(kv, id, body){
  if(!ID_RE.test(String(id))) return bad('id');
  if(!body || !ID_RE.test(String(body.key))) return bad('key');
  const [flat] = await kv.pipeline([['HGETALL', key(id)]]);
  const s = sessionView(flat);
  if(!s) return gone;
  if(sha256hex(body.key) !== s.meta.keyHash) return {status: 403, body: {error: 'bad facilitator key'}};
  const field = s.round === 2 ? 'revealed2' : 'revealed';
  await kv.pipeline([['HSET', key(id), field, '1']]);
  const out = {count: s.entries.length, answered: s.answered,
    revealed: true, names: s.meta.names, round: s.round, responses: s.entries};
  if(s.round === 2){
    out.count2 = s.entries2.length;
    out.answered2 = s.answered2;
    out.revealed2 = true;
    out.responses2 = s.entries2;
  }
  return {status: 200, body: out};
}

/* Facilitator-initiated early delete: shrinks the response-exposure window
   from the 24h TTL to the meeting itself. Questions never were here. */
export async function endSession(kv, id, body){
  if(!ID_RE.test(String(id))) return bad('id');
  if(!body || !ID_RE.test(String(body.key))) return bad('key');
  const [metaRaw] = await kv.pipeline([['HGET', key(id), 'meta']]);
  if(!metaRaw) return gone;
  if(sha256hex(body.key) !== JSON.parse(metaRaw).keyHash) return {status: 403, body: {error: 'bad facilitator key'}};
  await kv.pipeline([['DEL', key(id)]]);
  return {status: 200, body: {ok: true}};
}
