/* Full gate, affected checks and focused browser work share selection, server
   ownership, logging and exit semantics. See --help for the small public CLI. */
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SUITES, FILTER_TOOLS, ROOT, repositoryPlan, toolPlan, toolId} from '../test-plan.mjs';
import {SUITE_SECONDS} from './shards.mjs';
import {startServer, stopChild, own} from './session.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const options = {jobs:3, ports:[0,0]};
const value = i => { if(!args[i] || args[i].startsWith('--')) throw new Error('Missing value for ' + args[i-1]); return args[i]; };
for(let i=0;i<args.length;i++){
  const a = args[i];
  if(a === '--') continue;
  if(['--changed','--plan','--browser-only'].includes(a)) options[a.slice(2)] = true;
  else if(a === '--base') options.base = value(++i);
  else if(a === '--tool' || a === '--tools') options.tools = value(++i).split(',').map(toolId);
  else if(a === '--suites') options.suites = value(++i).split(',');
  else if(a === '--jobs') options.jobs = Number(value(++i));
  else if(a === '--ports') options.ports = [Number(value(++i)),Number(value(++i))];
  else if(a === '--help'){
    console.log('npm run gate [-- --jobs N]\nnpm run test:changed [-- --base origin/main --plan]\nnpm run test:browser -- --tool map [--suites smoke.mjs]\nBrowser runs bind private ports by default; --ports A B explicitly requests fixed ports.');
    process.exit(0);
  }else throw new Error('Unknown option: ' + a);
}
if(!Number.isInteger(options.jobs) || options.jobs < 1) throw new Error('--jobs must be a positive integer');
if(options.ports.some(p => !Number.isInteger(p) || p < 0 || p > 65535) ||
    options.ports[0] !== 0 && options.ports[0] === options.ports[1]) throw new Error('Invalid or duplicate ports');
if(options.changed && options.tools) throw new Error('Choose change-impact selection or explicit tools, not both');
let plan = options.changed ? repositoryPlan({base:options.base}) : options.tools ? toolPlan(options.tools) :
  {mode:'full',files:[],tools:[],suites:SUITES,reasons:['Full gate requested']};
if(options.suites){
  if(options.suites.some(s => !SUITES.includes(s)) || new Set(options.suites).size !== options.suites.length)
    throw new Error('--suites must contain unique registered suite filenames');
  if(options.suites.some(s => !plan.suites.includes(s))) throw new Error('Suite does not cover the selected tools');
  plan = {...plan,mode:'focused',suites:options.suites};
}
console.log('Selection: ' + plan.mode + (plan.tools.length ? ' — ' + plan.tools.join(', ') : ''));
for(const reason of plan.reasons) console.log('  ' + reason);
console.log('Browser suites (' + plan.suites.length + '): ' + (plan.suites.join(', ') || 'none required'));
if(options.plan){ console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

const evidence = mkdtempSync(join(tmpdir(), 'tools-tests-'));
console.log('Evidence: ' + evidence);
if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'evidence=' + evidence + '\n');
const started = Date.now(), results = [];
const env = {...process.env, TEST_EVIDENCE:evidence};
// Ambient filters must not turn a full gate into a partial one.
delete env.TEST_TOOLS;
delete env.CHAPTER_CASE;
delete env.CHAPTER_UNDO_ONLY;
for(const name of ['CHAPTER_OUTPUT','TIMELINE_EVIDENCE','WORKSHOP_CAPTURE','SUITE_SCREENSHOTS','RECENT_SCREENSHOTS']) delete env[name];
let failed = false;
async function run(name, commandArgs, {cwd = ROOT, childEnv = env, timeout = 10*60*1000} = {}){
  const start = Date.now();
  const log = join(evidence, name.replaceAll(/[^a-zA-Z0-9.-]/g,'-') + '.log');
  writeFileSync(log, '');
  console.log('▶ ' + name);
  const result = await new Promise(resolve => {
    let output = '', timedOut = false, killTimer;
    // Persist as output arrives: interruption must not erase a hung suite's clues.
    const append = value => { output += value; appendFileSync(log, value); };
    const child = own(spawn(process.execPath, commandArgs, {cwd, env:childEnv, detached:true, stdio:['ignore','pipe','pipe']}));
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      timedOut = true; append('\nTIMEOUT after ' + timeout/1000 + 's\n'); stopChild(child);
      killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    }, timeout);
    child.on('error', error => append('\n' + error.message));
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(killTimer);
      resolve({code:timedOut ? 1 : code ?? 1, output});
    });
  });
  const seconds = Math.round((Date.now() - start)/1000);

  results.push({name,code:result.code,seconds,log});
  console.log((result.code ? 'FAIL ' : 'PASS ') + name + ' (' + seconds + 's)');
  if(result.code){
    failed = true;
    const lines = result.output.trimEnd().split('\n');
    console.error([...new Set([...lines.filter(l => /FAIL|not ok/.test(l)), ...lines.slice(-35)])].join('\n'));
    console.error('Complete log: ' + log);
  }
}

const servers = [];
try{
  if(!options['browser-only'] && plan.mode !== 'none'){
    const nodeArgs = plan.mode === 'docs' ? ['--test','dev/docs.test.mjs','dev/dsl-doc.test.mjs'] :
      ['--test','--test-concurrency=1','dev/*.test.mjs','*/tests/*.mjs','energy/*/tests/*.mjs','lab/dist/*/*.test.js'];
    await run('node', nodeArgs);
    if(!failed && plan.mode !== 'docs') await run('goldens', ['dev/golden.mjs','verify']);
  }
  if(!failed && plan.suites.length){
    const tools = await startServer('dev/serve.mjs', {port:options.ports[0], env}); servers.push(tools);
    const energy = await startServer('dev/serve.mjs', {port:options.ports[1], args:['--origin=energy'], env}); servers.push(energy);
    Object.assign(env, {BASE:tools.base,EBASE:energy.base,EPORT:String(energy.port)});
    console.log('Owned origins: ' + tools.base + ' · ' + energy.base);
    const queue = [...plan.suites].sort((a,b) => SUITE_SECONDS[b] - SUITE_SECONDS[a]);
    const worker = async () => {
      while(queue.length){
        const suite = queue.shift();
        const supported = FILTER_TOOLS[suite];
        const selected = supported && plan.tools.filter(t => supported.includes(t));
        const childEnv = {...env};
        if(selected?.length) childEnv.TEST_TOOLS = JSON.stringify(selected);
        await run(suite, [suite], {cwd:HERE,childEnv});
      }
    };
    await Promise.all(Array.from({length:Math.min(options.jobs,plan.suites.length)}, worker));
  }
}catch(error){ failed = true; console.error(error.stack); }
finally{ for(const server of servers) server.stop(); }
const seconds = Math.round((Date.now()-started)/1000);
writeFileSync(join(evidence,'results.json'), JSON.stringify({plan,results,seconds,failed},null,2));
console.log('\n' + (failed ? 'CHECKS FAILED' : 'CHECKS PASSED') + ' — ' + plan.mode + ', ' + seconds + 's; evidence: ' + evidence);
if(failed && options.jobs > 1) console.log('Diagnose a parallel failure with --jobs 1 --browser-only --suites <failed-suite>; retain --tool when used.');
process.exitCode = failed ? 1 : 0;
