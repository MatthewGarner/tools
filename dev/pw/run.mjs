/* One-shot local pre-merge gate — the single command a human runs before merging,
   so every guard actually fires (CI here is a POST-merge signal, not a gate):
     node tests (3 globs) → golden verify → spawn both origins → browser chain → teardown.
   Ports default 8087/8089; `--ports TOOLS ENERGY` overrides for parallel sessions.
   8091 is rejected — gauge.mjs spawns its own relay there.
   Usage: node dev/pw/run.mjs [--ports 8087 8089] */
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';

const HERE = fileURLToPath(new URL('.', import.meta.url));         // dev/pw/
const ROOT = fileURLToPath(new URL('../../', import.meta.url));    // repo root

const pi = process.argv.indexOf('--ports');
const TP = pi >= 0 ? Number(process.argv[pi + 1]) : 8087;
const EP = pi >= 0 ? Number(process.argv[pi + 2]) : 8089;
if(!TP || !EP || TP === EP){ console.error('usage: node dev/pw/run.mjs [--ports TOOLS ENERGY]'); process.exit(2); }
if([TP, EP].includes(8091)){ console.error('8091 is reserved (gauge spawns its own relay there) — pick other ports.'); process.exit(2); }

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
    const up = (await waitHealthy(TP)) && (await waitHealthy(EP));
    results.push(['servers up (:' + TP + ' :' + EP + ')', up ? 0 : 1]);
    if(!up){ console.error('servers did not come up'); failed = true; }
  }

  if(!failed){
    // browser chain from the single-source verify script; one child per suite, envs set
    const verify = JSON.parse(readFileSync(HERE + 'package.json', 'utf8')).scripts.verify;
    const suites = verify.split('&&').map(s => s.trim().replace(/^node\s+/, ''));
    const env = {...process.env, BASE: 'http://localhost:' + TP, EBASE: 'http://localhost:' + EP, EPORT: String(EP)};
    for(const suite of suites) await step('pw ' + suite, () => run('node', [suite], {cwd: HERE, env}));
  }
} finally {
  killServers();
}

console.log('\n\x1b[1m── gate summary ──\x1b[0m');
for(const [name, code] of results) console.log((code ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m') + '  ' + name);
console.log(failed ? '\n\x1b[31mGATE FAILED\x1b[0m' : '\n\x1b[32mGATE PASSED\x1b[0m — safe to merge');
process.exit(failed ? 1 : 0);
