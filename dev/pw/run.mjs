/* One-shot local pre-merge gate — the single command a human runs before merging,
   so every guard actually fires (CI here is a POST-merge signal, not a gate):
     node tests (3 globs) → golden verify → spawn both origins → browser chain → teardown.
   Ports default 8087/8089; `--ports TOOLS ENERGY` overrides for parallel sessions.
   8091 is rejected — gauge.mjs spawns its own relay there.
   `--jobs N` (default 1 = serial) runs the browser suites in a pool of N; `--jobs`
   alone → 4 (the sweet spot). Parallel fails SAFE — confirm any red serially.
   Usage: node dev/pw/run.mjs [--ports 8087 8089] [--jobs N]
   (via npm: npm run gate -- --jobs 4) */
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
import {SUITE_SECONDS} from './shards.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));         // dev/pw/
const ROOT = fileURLToPath(new URL('../../', import.meta.url));    // repo root

const pi = process.argv.indexOf('--ports');
const TP = pi >= 0 ? Number(process.argv[pi + 1]) : 8087;
const EP = pi >= 0 ? Number(process.argv[pi + 2]) : 8089;
if(!TP || !EP || TP === EP){ console.error('usage: node dev/pw/run.mjs [--ports TOOLS ENERGY]'); process.exit(2); }
if([TP, EP].includes(8091)){ console.error('8091 is reserved (gauge spawns its own relay there) — pick other ports.'); process.exit(2); }

/* --jobs N runs the browser suites in a work-stealing pool of N against the SAME
   server pair (suites reuse the env servers; gauge is self-contained on :8091).
   Default 1 = today's exact serial, stop-on-first behaviour (the canonical gate).
   N>1 runs ALL suites to completion and can flake under CPU contention — it fails
   SAFE (spurious red, never false green): re-run a FAILed suite serially to confirm. */
const ji = process.argv.indexOf('--jobs');
let JOBS = 1;
if(ji >= 0){
  const n = process.argv[ji + 1];
  JOBS = (n && /^\d+$/.test(n)) ? Number(n) : 4;   // bare `--jobs` → 4 (the measured sweet spot)
  if(JOBS < 1){ console.error('--jobs must be >= 1'); process.exit(2); }
}

/* connect-probe: a refused connection means the port is free. */
const portFree = port => new Promise(res => {
  const s = createConnection({port, host: '127.0.0.1'}, () => { s.destroy(); res(false); });
  s.on('error', () => res(true));
});
async function waitHealthy(port){
  for(let i = 0; i < 50; i++){
    try{ const r = await fetch('http://localhost:' + port + '/'); if(r.ok) return true; }catch{}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}
const run = (cmd, args, opts = {}) => new Promise(res => {
  spawn(cmd, args, {stdio: 'inherit', ...opts}).on('close', code => res(code ?? 1));
});
/* parallel path only: capture a suite's output (piped, so N suites don't interleave)
   and flush it grouped on completion; a wall-clock timeout SIGTERMs a HUNG suite
   (pwa/gauge have hang history — a buffered hang would otherwise be invisible). */
const runCaptured = (cmd, args, opts, timeoutMs) => new Promise(res => {
  const child = spawn(cmd, args, {...opts, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => out += d);
  const timer = setTimeout(() => {
    out += '\n[gate] TIMEOUT after ' + Math.round(timeoutMs / 1000) + 's — SIGTERM\n';
    try{ child.kill('SIGTERM'); }catch{}
  }, timeoutMs);
  child.on('close', code => { clearTimeout(timer); res({code: code ?? 1, out}); });
});

const servers = [];
function killServers(){ for(const c of servers) try{ process.kill(-c.pid, 'SIGTERM'); }catch{} servers.length = 0; }
process.on('exit', killServers);
for(const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killServers(); process.exit(sig === 'SIGINT' ? 130 : 143); });

const results = [];
let failed = false;
async function step(name, fn){
  if(failed) return;   // stop-on-first-failure, like the && chain
  console.log('\n\x1b[1m▶ ' + name + '\x1b[0m');
  const code = await fn();
  results.push([name, code]);
  if(code) failed = true;
}
/* work-stealing pool over the flat verify suites (NOT the CI shards — a static
   split load-balances worse on one machine). Longest-first by SUITE_SECONDS;
   runs ALL to completion (no early-abort, no killing in-flight siblings — that
   would orphan browser trees); results pushed in verify-chain order for run-to-run
   comparability; per-suite 10-min timeout. */
async function poolRun(suites, n, env){
  const queue = [...suites].sort((a, b) => (SUITE_SECONDS[b] || 60) - (SUITE_SECONDS[a] || 60));
  const codes = new Map();
  const worker = async () => {
    for(;;){
      const suite = queue.shift();
      if(!suite) return;
      const t0 = Date.now();
      console.log('\x1b[2m▶ pw ' + suite + ' — started\x1b[0m');
      const {code, out} = await runCaptured('node', [suite], {cwd: HERE, env}, 10 * 60 * 1000);
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log('\n\x1b[1m── pw ' + suite + ' (' + secs + 's) ' +
        (code ? '\x1b[31mFAIL' : '\x1b[32mPASS') + '\x1b[0m ──');
      process.stdout.write(out.trimEnd() + '\n');
      codes.set(suite, code);
      if(code) failed = true;
    }
  };
  await Promise.all(Array.from({length: Math.min(n, suites.length)}, worker));
  for(const s of suites) results.push(['pw ' + s, codes.get(s) ?? 1]);
}

try{
  await step('node tests (dev/ + tool + energy globs)', () => run('node',
    ['--test', '--test-concurrency=1', 'dev/*.test.mjs', '*/tests/*.mjs', 'energy/*/tests/*.mjs'], {cwd: ROOT}));
  await step('golden verify (identical + committed)', () => run('node', ['dev/golden.mjs', 'verify'], {cwd: ROOT}));

  if(!failed){
    for(const port of [TP, EP]){
      if(!(await portFree(port))){
        console.error('\nport ' + port + ' is already in use — free it (lsof -ti:' + port + ' | xargs kill) or pass --ports A B.');
        results.push(['ports free', 1]); failed = true; break;
      }
    }
  }
  if(!failed){
    for(const [port, extra] of [[TP, []], [EP, ['--origin=energy']]])
      servers.push(spawn('node', ['dev/serve.mjs', String(port), '--exit-with-parent', ...extra],
        {cwd: ROOT, detached: true, stdio: 'ignore'}));
    // require OUR servers alive too: if a foreign process held the port and our
    // serve died EADDRINUSE, waitHealthy would green against the wrong server —
    // the stale-server false-green this whole gate exists to kill.
    const up = (await waitHealthy(TP)) && (await waitHealthy(EP)) && servers.every(c => c.exitCode === null);
    results.push(['servers up (:' + TP + ' :' + EP + ')', up ? 0 : 1]);
    if(!up){ console.error('servers did not come up (or ours died — port taken?)'); failed = true; }
  }

  if(!failed){
    // browser chain from the single-source verify script; one child per suite, envs set
    const verify = JSON.parse(readFileSync(HERE + 'package.json', 'utf8')).scripts.verify;
    const suites = verify.split('&&').map(s => s.trim().replace(/^node\s+/, ''));
    const env = {...process.env, BASE: 'http://localhost:' + TP, EBASE: 'http://localhost:' + EP, EPORT: String(EP)};
    if(JOBS <= 1){
      for(const suite of suites) await step('pw ' + suite, () => run('node', [suite], {cwd: HERE, env}));
    } else {
      const n = Math.min(JOBS, suites.length);
      if(JOBS > 5) console.log('\x1b[33m[gate] --jobs ' + JOBS + ': smoke (~138s) is the floor — >5 buys little and risks flake under load; 4 is the sweet spot.\x1b[0m');
      console.log('\n\x1b[1m▶ browser chain — PARALLEL (' + n + ' jobs, longest-first)\x1b[0m');
      await poolRun(suites, n, env);   // runs ALL to completion; sets `failed` on any red
    }
  }
} finally {
  killServers();
}

console.log('\n\x1b[1m── gate summary' + (JOBS > 1 ? ' (PARALLEL, ' + JOBS + ' jobs)' : '') + ' ──\x1b[0m');
for(const [name, code] of results) console.log((code ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m') + '  ' + name);
if(failed && JOBS > 1) console.log('\x1b[33mNote: a parallel run can flake under load — re-run any FAILed suite serially (cd dev/pw && node <suite>) to confirm before trusting the red.\x1b[0m');
console.log(failed ? '\n\x1b[31mGATE FAILED\x1b[0m' : '\n\x1b[32mGATE PASSED\x1b[0m — safe to merge');
process.exit(failed ? 1 : 0);
