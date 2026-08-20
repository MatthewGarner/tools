import {cpSync, existsSync, mkdirSync, symlinkSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(ROOT);

export function validateName(name){
  if(typeof name !== 'string' || name === 'main' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error('worktree name must be lowercase kebab-case and cannot be main');
  return name;
}

export const branchFor = name => `worktree-${validateName(name)}`;

export function parseWorktreeList(text){
  for(const block of text.trim().split('\n\n')){
    const lines = block.split('\n');
    const worktree = lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length);
    if(worktree && lines.includes('branch refs/heads/main')) return worktree;
  }
  throw new Error('could not find the primary checkout on branch main');
}

export const trackedChanges = status => status.split('\n').filter(line => line && !line.startsWith('??') && !line.startsWith('!!'));

function git(cwd, args){
  return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}).trim();
}

function branchExists(cwd, branch){
  return spawnSync('git', ['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
}

function copyIfPresent(from, to){
  if(!existsSync(from)) return false;
  cpSync(from, to, {recursive: true, errorOnExist: true});
  return true;
}

function linkIfPresent(from, to){
  if(!existsSync(from)) return false;
  symlinkSync(from, to);
  return true;
}

export function createWorktree(name, {repo = REPO} = {}){
  validateName(name);
  const primary = parseWorktreeList(git(repo, ['worktree', 'list', '--porcelain']));
  if(git(primary, ['branch', '--show-current']) !== 'main')
    throw new Error(`primary checkout is not on main: ${primary}`);

  const changes = trackedChanges(git(primary, ['status', '--porcelain']));
  if(changes.length) throw new Error(`primary checkout has tracked changes:\n${changes.join('\n')}`);

  const branch = branchFor(name);
  const destination = join(primary, '.Codex', 'worktrees', name);
  if(existsSync(destination)) throw new Error(`worktree destination already exists: ${destination}`);
  if(branchExists(primary, branch)) throw new Error(`branch already exists: ${branch}`);

  mkdirSync(dirname(destination), {recursive: true});
  execFileSync('git', ['-C', primary, 'worktree', 'add', '-b', branch, destination, 'main'], {stdio: 'inherit'});

  copyIfPresent(join(primary, '.vercel'), join(destination, '.vercel'));
  copyIfPresent(join(primary, 'AGENTS.local.md'), join(destination, 'AGENTS.local.md'));
  linkIfPresent(join(primary, 'dev', 'pw', 'node_modules'), join(destination, 'dev', 'pw', 'node_modules'));

  if(!existsSync(join(destination, 'AGENTS.md')))
    throw new Error(`new worktree is missing tracked AGENTS.md: ${destination}`);

  return {branch, destination};
}

function usage(){
  console.error('usage: npm run worktree -- create <lowercase-kebab-name>');
}

function main(){
  const [command, name, ...extra] = process.argv.slice(2);
  if(command !== 'create' || !name || extra.length){ usage(); process.exitCode = 2; return; }
  try{
    const {branch, destination} = createWorktree(name);
    console.log(`created ${branch}\n${destination}`);
  }catch(error){
    console.error(error.message);
    process.exitCode = 1;
  }
}

if(import.meta.url === pathToFileURL(process.argv[1]).href) main();
