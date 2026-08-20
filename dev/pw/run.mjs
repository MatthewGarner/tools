/* One-shot local pre-merge gate — the single command a human runs before merging,
   so every guard actually fires (CI here is a POST-merge signal, not a gate):
     node tests (3 globs) → golden verify → spawn both origins → browser chain → teardown.
   Ports default 8087/8089; `--ports TOOLS ENERGY` overrides for parallel sessions.
   8091 is rejected — gauge.mjs spawns its own relay there.
   `--jobs N` runs the browser suites in a pool of N. **DEFAULT 3** (Matt, 2026-08-18)
   — `--jobs 1` is the serial path when you need it. Parallel fails SAFE: it never
   yields a false green, so a red costs one cheap serial re-run of that suite (the
   summary prints the command). The default flipped because the pool is not only
   ~2.5x faster but STRICTLY more informative: serial stops at the first failure, so
   a bad change surfaces one problem per run, while the pool runs every suite to
   completion and shows all the damage at once.
   Usage: node dev/pw/run.mjs [--ports 8087 8089] [--jobs N]
   (via npm: npm run gate  ·  serial: npm run gate -- --jobs 1) */
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
   DEFAULT 3 since 2026-08-18. N>1 runs ALL suites to completion and can flake under
   CPU contention — it fails SAFE (spurious red, never false green): re-run a FAILed
   suite serially to confirm, which the summary tells you to do.
   `--jobs 1` is the serial, stop-on-first path, and is what you re-run a red under.
   3 is the ceiling on this machine and the ceiling is MEMORY, not cores: swap ran
   1.5G of 3G at 2 jobs and 2.6G of 3G at 3, on 8GB/8 cores, and an earlier session
   OOM-killed at 4. Per-suite times were unchanged (within 3s) at both 2 and 3, so
   the parallelism costs nothing in reliability up to there. */
const ji = process.argv.indexOf('--jobs');
let JOBS = 3;   // the default gate is the pool; --jobs 1 is serial. See the header.
if(ji >= 0){
  const n = process.argv[ji + 1];
  JOBS = (n && /^\d+$/.test(n)) ? Number(n) : 3;   // bare `--jobs` → 3; the note below warns above it
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
   assertion would flake across machines. Threshold ~1.75x either way: loose
   enough that normal machine variance stays quiet, tight enough to catch the
   class of staleness that shipped 2026-08-17 (a suite reporting HALF its measured
   time, and a wrong longest-first ordering as a result). */
function driftNote(suiteFile, secs, suiteFailed){
  const hint = SUITE_SECONDS[suiteFile];
  if(typeof hint !== 'number' || hint <= 0) return;
  /* A ±1.75x band on a 4-second suite trips on ordinary jitter (signal 4s, case 5s,
     map 9s), and a note that cries wolf is one people learn to skip — which is the
     one thing this must not become. Below 20s the absolute drift is too small to act
     on anyway. Nor does a FAILED suite need a "hint may be stale" line beside its
     real failure: a suite that died early is fast for a reason. */
  if(secs < 20 || hint < 20 || suiteFailed) return;
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
      driftNote(suite, secs, !!code);   // parallel-path wall-clock is noisier (N suites share cores) — note, don't gate on it
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
        if(typeof secs === 'number') driftNote(suite, secs, failed);
      }
    } else {
      const n = Math.min(JOBS, suites.length);
      /* The floor is the LONGEST SINGLE suite — no amount of parallelism beats it.
         That is check-eip, not smoke: the advice here named smoke on hints that were
         stale by 2.5x, and recommended 4 jobs on the same bad numbers (fixed 2026-08-17).

         MEASURED on this machine (8GB/8 cores), all 13 suites green each time:
         serial 18m39s · --jobs 2 9m30s (1.96x) · --jobs 3 6m30s (2.87x), with per-suite
         times unchanged in both parallel runs (within 3s) — so 2 and 3 cost nothing in
         reliability. Those three runs PREDATE check-eip's sleep conversion the same day
         (314s → 212s), so treat them as the shape, not the current clock: serial is now
         16m57s and the suite sum 993s.

         The cap at 3 is a MEMORY judgement, not an arithmetic one — and the arithmetic
         has since changed sides, which is worth stating rather than quietly keeping the
         old conclusion. Swap ran 1.5G of 3G at 2 jobs and 2.6G of 3G at 3; a prior
         session had --jobs 4 OOM-killed on this box. Post-conversion, 4 jobs would NOT
         be floor-bound (993/4 = 248s against a 212s floor), so it does have headroom —
         untested, because 3 already left only 434MB of swap free. On a machine with more
         RAM, raise it. */
      if(JOBS > 3) console.log('\x1b[33m[gate] --jobs ' + JOBS + ': on 8GB/8 cores, 3 was the measured ceiling ' +
        '(swap 2.6G of 3G at 3 jobs; --jobs 4 was OOM-killed here in an earlier session). Post-conversion, >3 does have ' +
        'arithmetic headroom (993s over 4 lanes vs check-eip\'s ~212s floor) — but it is untested. A note, not a limit.\x1b[0m');
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
