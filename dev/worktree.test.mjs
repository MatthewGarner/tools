import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {branchFor, createWorktree, parseWorktreeList, trackedChanges, validateName} from './worktree.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8'});

test('validateName accepts portable worktree names', () => {
  assert.equal(validateName('agent-context'), 'agent-context');
  assert.equal(validateName('p0'), 'p0');
});

test('validateName rejects ambiguous or unsafe worktree names', () => {
  for(const name of ['', 'main', 'Agent-Context', 'agent_context', '../outside', '-agent'])
    assert.throws(() => validateName(name), /worktree name/);
});

test('branchFor reserves the worktree namespace', () => {
  assert.equal(branchFor('agent-context'), 'worktree-agent-context');
});

test('parseWorktreeList finds the primary main checkout', () => {
  const text = [
    'worktree /repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.Codex/worktrees/feature',
    'HEAD def456',
    'branch refs/heads/worktree-feature',
    '',
  ].join('\n');
  assert.equal(parseWorktreeList(text), '/repo');
});

test('trackedChanges ignores untracked files but keeps index and worktree changes', () => {
  const status = ' M assets/page.css\n?? screenshot.png\nA  new-file.js\n';
  assert.deepEqual(trackedChanges(status), [' M assets/page.css', 'A  new-file.js']);
});

test('createWorktree distributes tracked and optional local guidance', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tools-worktree-'));
  try{
    git(repo, ['init']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test']);
    mkdirSync(join(repo, 'dev', 'pw', 'node_modules'), {recursive: true});
    mkdirSync(join(repo, '.vercel'));
    writeFileSync(join(repo, 'AGENTS.md'), '# tracked guide\n');
    writeFileSync(join(repo, 'CLAUDE.md'), '# compatibility guide\n');
    writeFileSync(join(repo, 'dev', 'pw', 'package.json'), '{}\n');
    writeFileSync(join(repo, '.vercel', 'project.json'), '{}\n');
    writeFileSync(join(repo, 'AGENTS.local.md'), '# private overlay\n');
    git(repo, ['add', 'AGENTS.md', 'CLAUDE.md', 'dev/pw/package.json']);
    git(repo, ['commit', '-m', 'fixture']);
    git(repo, ['branch', '-M', 'main']);

    const {branch, destination} = createWorktree('bootstrap-check', {repo});
    assert.equal(branch, 'worktree-bootstrap-check');
    assert.equal(existsSync(join(destination, 'AGENTS.md')), true);
    assert.equal(existsSync(join(destination, 'CLAUDE.md')), true);
    assert.equal(existsSync(join(destination, 'AGENTS.local.md')), true);
    assert.equal(existsSync(join(destination, '.vercel', 'project.json')), true);
    assert.equal(lstatSync(join(destination, 'dev', 'pw', 'node_modules')).isSymbolicLink(), true);
  } finally {
    rmSync(repo, {recursive: true, force: true});
  }
});

test('root gate command forwards npm arguments to the harness', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts;
  assert.equal(scripts.gate, 'npm --prefix dev/pw run gate --');
  assert.equal(scripts['gate:serial'], 'npm --prefix dev/pw run gate -- --jobs 1');
});
