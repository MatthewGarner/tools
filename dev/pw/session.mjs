/* Each process owns its servers. Port 0 is bound by the child, then its actual
   address arrives over IPC: no probe/reuse race with another worktree. */
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const owned = new Set();
export function stopChild(child){
  if(child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
}
function cleanup(){ for(const child of owned) stopChild(child); }
process.once('exit', cleanup);
for(const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { cleanup(); process.exit(signal === 'SIGINT' ? 130 : 143); });

export function own(child){ owned.add(child); child.once('close', () => owned.delete(child)); return child; }
export async function startServer(script = 'dev/serve.mjs', {port = 0, args = [], env = process.env} = {}){
  const child = own(spawn(process.execPath, [script, String(port), '--exit-with-parent', ...args],
    {cwd:ROOT, env, detached:true, stdio:['ignore','pipe','pipe','ipc']}));
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  try{
    const actual = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server readiness timeout: ' + script + '\n' + output)), 10000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(script + ' exited ' + code + '\n' + output)));
      child.once('message', message => {
        clearTimeout(timer);
        if(!Number.isInteger(message.port) || message.port < 1) reject(new Error('Invalid server address'));
        else resolve(message.port);
      });
    });
    return {child, port:actual, base:'http://localhost:' + actual, stop:() => stopChild(child)};
  }catch(error){ stopChild(child); throw error; }
}
export function evidenceDirectory(name){
  const base = process.env.TEST_EVIDENCE || mkdtempSync(join(tmpdir(), 'tools-tests-'));
  const directory = join(base, name);
  mkdirSync(directory, {recursive:true});
  return directory;
}
