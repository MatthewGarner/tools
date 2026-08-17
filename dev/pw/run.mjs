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

const gateT0 = Date.now();
const results = [];   // [name, code, secs?]
let failed = false;
async function step(name, fn){
  if(failed) return;   // stop-on-first-failure, like the && chain
  console.log('\n\x1b[1m▶ ' + name + '\x1b[0m');
  const t0 = Date.now();
  const code = await fn();
  const secs = Math.round((Date.now() - t0) / 1000);
  results.push([name, code, secs]);
  if(code) failed = true;
  return secs;
}
/* Compare a measured suite time against its SUITE_SECONDS hint. A NOTE only —
   never touches `failed` or the exit code — because hardware varies and a hard
   assertion here would flake across machines (the reason CLAUDE.md's rule 4 rules
   out a node test for hint accuracy too). Threshold ~1.75x either way: loose
   enough that normal machine variance stays quiet, tight enough to catch the
   class of staleness that shipped 2026-08-17 (a suite reporting HALF its measured
   time, and a wrong longest-first ordering as a result). */
function driftNote(suiteFile, secs){
  const hint = SUITE_SECONDS[suiteFile];
  if(typeof hint !== 'number' || hint <= 0) return;
  const ratio = secs / hint;
  if(ratio > 1.75 || ratio < 1 / 1.75)
    console.log('\x1b[33m[gate] NOTE: ' + suiteFile + ' took ' + secs + 's, SUITE_SECONDS hints ' + hint +
      's (' + ratio.toFixed(2) + 'x) — the hint may be stale (dev/pw/shards.mjs). Does not affect the gate result.\x1b[0m');
}
const mmss = s => (s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's');
/* work-stealing pool over the flat verify suites (NOT the CI shards — a static
   split load-balances worse on one machine). Longest-first by SUITE_SECONDS;
   runs ALL to completion (no early-abort, no killing in-flight siblings — that
   would orphan browser trees); results pushed in verify-chain order for run-to-run
   comparability; per-suite 10-min timeout. */
async function poolRun(suites, n, env){
  const queue = [...suites].sort((a, b) => (SUITE_SECONDS[b] || 60) - (SUITE_SECONDS[a] || 60));
  const codes = new Map();
  const timings = new Map();
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
      timings.set(suite, secs);
      driftNote(suite, secs);   // parallel-path wall-clock is noisier (N suites share cores) — note, don't gate on it
      if(code) failed = true;
    }
  };
  await Promise.all(Array.from({length: Math.min(n, suites.length)}, worker));
  for(const s of suites) results.push(['pw ' + s, codes.get(s) ?? 1, timings.get(s)]);
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
      for(const suite of suites){
        const secs = await step('pw ' + suite, () => run('node', [suite], {cwd: HERE, env}));
        if(typeof secs === 'number') driftNote(suite, secs);
      }
    } else {
      const n = Math.min(JOBS, suites.length);
      /* The floor is the LONGEST SINGLE suite — no amount of parallelism beats it.
         That is check-eip (~312s), not smoke (~195s): the old advice here named smoke
         on hints that were stale by 2.5x, and recommended 4 jobs on the same bad
         numbers (both fixed 2026-08-17).

         MEASURED on this machine (8GB/8 cores), same commit, all 13 suites green each
         time: serial 18m39s · --jobs 2 9m30s (1.96x) · --jobs 3 6m30s (2.87x). Per-suite
         times were unchanged in both parallel runs (within 3s), so 2 and 3 cost nothing
         in reliability. What moves is MEMORY, not CPU: swap went 1.5G of 3G at 2 jobs to
         2.6G of 3G at 3. That is why 3 is the ceiling here and 4 is not recommended — a
         prior session recorded --jobs being OOM-killed on this box, which is consistent.
         3 also gets within 7% of its own arithmetic best (365s), so there is little left
         to win: 4 jobs could only reach check-eip's 312s floor, ~1 minute better, for
         real OOM risk. On a machine with more RAM, raise it. */
      if(JOBS > 3) console.log('\x1b[33m[gate] --jobs ' + JOBS + ': measured on 8GB/8 cores, 3 is the ceiling ' +
        '(swap 2.6G of 3G at 3 jobs; 6m30s vs 9m30s at 2). check-eip (~312s) is the hard floor, so >3 buys ~1 minute ' +
        'at OOM risk. Fine on a bigger machine — this is a note, not a limit.\x1b[0m');
      console.log('\n\x1b[1m▶ browser chain — PARALLEL (' + n + ' jobs, longest-first)\x1b[0m');
      await poolRun(suites, n, env);   // runs ALL to completion; sets `failed` on any red
    }
  }
} finally {
  killServers();
}

console.log('\n\x1b[1m── gate summary' + (JOBS > 1 ? ' (PARALLEL, ' + JOBS + ' jobs)' : '') + ' ──\x1b[0m');
for(const [name, code, secs] of results)
  console.log((code ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m') + '  ' + name +
    (typeof secs === 'number' ? '  (' + mmss(secs) + ')' : ''));
const wallSecs = Math.round((Date.now() - gateT0) / 1000);
console.log('\x1b[1mtotal wall-clock: ' + mmss(wallSecs) + '\x1b[0m' +
  (JOBS > 1 ? '  (parallel — sum of per-suite times will exceed this)' : ''));
if(failed && JOBS > 1) console.log('\x1b[33mNote: a parallel run can flake under load — re-run any FAILed suite serially (cd dev/pw && node <suite>) to confirm before trusting the red.\x1b[0m');
console.log(failed ? '\n\x1b[31mGATE FAILED\x1b[0m' : '\n\x1b[32mGATE PASSED\x1b[0m — safe to merge');
process.exit(failed ? 1 : 0);
